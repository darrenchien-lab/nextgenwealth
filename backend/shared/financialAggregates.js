'use strict'
const { query } = require('../db/pool')
const currencyService = require('../services/currency')
const accountsService = require('../services/accounts')
const periods = require('./periods')
const { badRequest } = require('./utils')

// Transactions are placed in a period by COALESCE(t.cycle_date, t.occurred_at):
// the real date, unless the transaction was set to count in the next cycle.
//
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
       AND ($2::timestamp IS NULL OR COALESCE(t.cycle_date, t.occurred_at) >= $2)
       AND ($3::timestamp IS NULL OR COALESCE(t.cycle_date, t.occurred_at) <= $3)`,
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

// 'YYYY-MM' key of a budget cycle (the month it starts in).
const cycleKey = (start) => `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Expense breakdown by category for a period, as amounts and percentages.
// Defaults to the user's current budget cycle when no explicit range is
// given (mirrors getDashboardSummary's default), instead of all-time;
// periodOffset 1 is the cycle before it, like the dashboard toggle.
const getExpenseBreakdown = async (userId, { startDate, endDate, categoryId, periodOffset } = {}) => {
  const displayCurrency = await getDisplayCurrency(userId)

  let effectiveStartDate = startDate
  let effectiveEndDate = endDate
  let periodLabel = null
  let period = null
  if (!startDate && !endDate) {
    const cycleStartDay = await accountsService.getCycleStartDay(userId)
    const { start, end } = periods.getPeriodBoundsForOffset(cycleStartDay, Number(periodOffset) === 1 ? 1 : 0)
    effectiveStartDate = start.toISOString()
    effectiveEndDate = end.toISOString()
    periodLabel = periods.formatPeriodLabel(start, end, cycleStartDay)
    period = cycleKey(start)
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
       AND ($2::timestamp IS NULL OR COALESCE(t.cycle_date, t.occurred_at) >= $2)
       AND ($3::timestamp IS NULL OR COALESCE(t.cycle_date, t.occurred_at) <= $3)
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

  return { displayCurrency, total: Math.round(total * 100) / 100, breakdown, hasUnconverted, periodLabel, period }
}

// Day-by-day running totals of income and expense through one budget cycle
// (periodOffset 0 = the current one, up to today; 1 = the previous one, in
// full), for the dashboard's "this cycle" trend. Each transaction lands on
// the day it counts for — a salary counted in the next cycle shows on that
// cycle's first day.
const getCycleTrend = async (userId, { periodOffset } = {}) => {
  const displayCurrency = await getDisplayCurrency(userId)
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const { start, end } = periods.getPeriodBoundsForOffset(cycleStartDay, Number(periodOffset) === 1 ? 1 : 0)

  const result = await query(
    `SELECT t.type, t.amount, a.currency, TO_CHAR(COALESCE(t.cycle_date, t.occurred_at), 'YYYY-MM-DD') AS day
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = $1
       AND COALESCE(t.cycle_date, t.occurred_at) >= $2
       AND COALESCE(t.cycle_date, t.occurred_at) <= $3`,
    [userId, start, end]
  )

  const byDay = new Map()
  let hasUnconverted = false
  for (const row of result.rows) {
    const { amount, available } = await currencyService.convertAmount(Number(row.amount), row.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    const day = byDay.get(row.day) || { income: 0, expense: 0 }
    day[row.type === 'income' ? 'income' : 'expense'] += amount
    byDay.set(row.day, day)
  }

  const today = new Date()
  const lastDay = end < today ? end : today
  const days = []
  let income = 0
  let expense = 0
  for (let d = new Date(start); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d)
    income += byDay.get(key)?.income || 0
    expense += byDay.get(key)?.expense || 0
    days.push({
      date: key,
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      net: Math.round((income - expense) * 100) / 100
    })
  }

  return { displayCurrency, period: cycleKey(start), periodLabel: periods.formatPeriodLabel(start, end, cycleStartDay), days, hasUnconverted }
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
       AND COALESCE(t.cycle_date, t.occurred_at) >= $3 AND COALESCE(t.cycle_date, t.occurred_at) <= $4`,
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
  getCycleTrend,
  getMonthlyTrend,
  getSpentForCategoryPeriod
}
