'use strict'
const { query } = require('../db/pool')
const currencyService = require('../services/currency')
const accountsService = require('../services/accounts')
const periods = require('./periods')
const { badRequest } = require('./utils')

// Every transaction's amount is in its own account's currency. All
// aggregates below convert each row into the user's display currency before
// summing, per the `reports` spec's Multi-Currency Aggregation requirement.
// When a needed rate has never been cached, the unconvertible amount is
// tracked separately instead of being silently dropped or misreported.
const convertRows = async (rows, displayCurrency) => {
  let convertedTotal = 0
  let hasUnconverted = false

  for (const row of rows) {
    const { amount, available } = await currencyService.convertAmount(
      Number(row.amount),
      row.currency,
      displayCurrency
    )
    if (!available) {
      hasUnconverted = true
      continue
    }
    convertedTotal += row.type === 'expense' ? -amount : amount
  }

  return { convertedTotal, hasUnconverted }
}

const getDisplayCurrency = async (userId) => {
  const result = await query('SELECT display_currency FROM users WHERE id = $1', [userId])
  return result.rows[0]?.display_currency || 'IDR'
}

// Income/expense/net for an arbitrary date range.
const getIncomeExpense = async (userId, { startDate, endDate }) => {
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw badRequest('startDate must not be after endDate')
  }
  const displayCurrency = await getDisplayCurrency(userId)

  const result = await query(
    `SELECT t.type, t.amount, a.currency
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = $1
       AND ($2::timestamp IS NULL OR t.occurred_at >= $2)
       AND ($3::timestamp IS NULL OR t.occurred_at <= $3)`,
    [userId, startDate || null, endDate || null]
  )

  let income = 0
  let expense = 0
  let hasUnconverted = false
  for (const row of result.rows) {
    const { amount, available } = await currencyService.convertAmount(Number(row.amount), row.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    if (row.type === 'income') income += amount
    else expense += amount
  }

  return {
    displayCurrency,
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    net: Math.round((income - expense) * 100) / 100,
    hasUnconverted
  }
}

// Expense breakdown by category for a period, as amounts and percentages.
// Defaults to the user's current budget cycle when no explicit range is
// given (mirrors getDashboardSummary's default), instead of all-time.
const getExpenseBreakdown = async (userId, { startDate, endDate, categoryId } = {}) => {
  const displayCurrency = await getDisplayCurrency(userId)

  let effectiveStartDate = startDate
  let effectiveEndDate = endDate
  let periodLabel = null
  if (!startDate && !endDate) {
    const cycleStartDay = await accountsService.getCycleStartDay(userId)
    const { start, end } = periods.getCurrentPeriodBounds(cycleStartDay)
    effectiveStartDate = start.toISOString()
    effectiveEndDate = end.toISOString()
    periodLabel = periods.formatPeriodLabel(start, end, cycleStartDay)
  }

  const params = [userId, effectiveStartDate || null, effectiveEndDate || null]
  let categoryFilter = ''
  if (categoryId !== undefined && categoryId !== null) {
    params.push(categoryId)
    categoryFilter = `AND t.category_id = $${params.length}`
  }

  const result = await query(
    `SELECT t.category_id, c.name AS category_name, t.amount, a.currency
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = $1 AND t.type = 'expense'
       AND ($2::timestamp IS NULL OR t.occurred_at >= $2)
       AND ($3::timestamp IS NULL OR t.occurred_at <= $3)
       ${categoryFilter}`,
    params
  )

  const byCategory = new Map()
  let total = 0
  let hasUnconverted = false

  for (const row of result.rows) {
    const { amount, available } = await currencyService.convertAmount(Number(row.amount), row.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    const key = row.category_id ?? 'uncategorized'
    const entry = byCategory.get(key) || { categoryId: row.category_id, categoryName: row.category_name || 'Uncategorized', amount: 0 }
    entry.amount += amount
    byCategory.set(key, entry)
    total += amount
  }

  const breakdown = Array.from(byCategory.values()).map((entry) => ({
    ...entry,
    amount: Math.round(entry.amount * 100) / 100,
    percentage: total > 0 ? Math.round((entry.amount / total) * 1000) / 10 : 0
  }))

  return { displayCurrency, total: Math.round(total * 100) / 100, breakdown, hasUnconverted, periodLabel }
}

// Income/expense/net for each of the last N budget cycles, oldest first.
const getMonthlyTrend = async (userId, months) => {
  if (!Number.isInteger(months) || months <= 0) {
    throw badRequest('months must be a positive integer')
  }

  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const results = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const { start, end } = periods.getPeriodBoundsForOffset(cycleStartDay, i)
    const { income, expense, net, displayCurrency, hasUnconverted } = await getIncomeExpense(userId, {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    })
    results.push({
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      periodLabel: periods.formatPeriodLabel(start, end, cycleStartDay),
      income,
      expense,
      net,
      displayCurrency,
      hasUnconverted
    })
  }
  return results
}

// Total spent against a category for a 'YYYY-MM' budget-cycle period label,
// converted into targetCurrency (used by budgets, which have their own
// chosen currency independent of the user's display currency — falls back
// to the display currency when no target is given, for any other caller).
const getSpentForCategoryPeriod = async (userId, categoryId, period, targetCurrency) => {
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const { start, end } = periods.periodKeyToBounds(cycleStartDay, period)
  const displayCurrency = targetCurrency || await getDisplayCurrency(userId)

  const result = await query(
    `SELECT t.amount, a.currency
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = $1 AND t.category_id = $2 AND t.type = 'expense'
       AND t.occurred_at >= $3 AND t.occurred_at <= $4`,
    [userId, categoryId, start.toISOString(), end.toISOString()]
  )

  let spent = 0
  for (const row of result.rows) {
    const { amount, available } = await currencyService.convertAmount(Number(row.amount), row.currency, displayCurrency)
    if (available) spent += amount
  }
  return { spent: Math.round(spent * 100) / 100, displayCurrency }
}

module.exports = {
  getDisplayCurrency,
  getIncomeExpense,
  getExpenseBreakdown,
  getMonthlyTrend,
  getSpentForCategoryPeriod
}
