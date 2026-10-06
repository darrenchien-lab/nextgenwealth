'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, conflict, assertOwned } = require('../shared/utils')
const { isValidCurrencyCode } = require('../shared/currencyCodes')
const categoriesService = require('./categories')
const aggregates = require('../shared/financialAggregates')
const periods = require('../shared/periods')
const accountsService = require('./accounts')

const SQL = {
  create: loadSql('budgets/create'),
  getById: loadSql('budgets/getById'),
  listByPeriod: loadSql('budgets/listByPeriod'),
  update: loadSql('budgets/update'),
  delete: loadSql('budgets/delete')
}

// The period label is the month the user's *current budget cycle* starts
// in, not necessarily the calendar month "now" falls in — e.g. with a
// cutoff day of 10, the 5th of September still belongs to the cycle that
// started August 10th, so its label is '2026-08'.
const currentPeriod = async (userId) => {
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  return periods.periodKeyForDate(cycleStartDay, new Date())
}

const shiftPeriod = (period, monthsBack) => {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(year, month - 1 - monthsBack, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// currency defaults to the user's current display currency when omitted,
// but a budget's currency is its own — set once at creation, independent of
// whatever the user's display currency is later changed to (design.md —
// same reasoning as an account's currency being fixed at creation).
const createBudget = async (userId, { categoryId, period, limitAmount, currency }) => {
  const numericLimit = Number(limitAmount)
  if (!(numericLimit > 0)) throw badRequest('limitAmount must be a positive number')
  if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) throw badRequest('period must be in YYYY-MM format')
  await categoriesService.requireCategory(userId, categoryId)

  const resolvedCurrency = currency || await accountsService.getDisplayCurrency(userId)
  if (!isValidCurrencyCode(resolvedCurrency)) throw badRequest('A valid ISO 4217 currency code is required')

  try {
    const result = await query(SQL.create, [userId, categoryId, period, numericLimit, resolvedCurrency.toUpperCase()])
    return result.rows[0]
  } catch (err) {
    if (err.code === '23505') throw conflict('A budget for this category and period already exists')
    throw err
  }
}

const getBudgetById = async (userId, id) => {
  const result = await query(SQL.getById, [id])
  return assertOwned(result.rows[0], userId, 'Budget not found')
}

// category/period/limitAmount all default to the existing value when
// omitted, same as updateBill — a caller only needs to send the field(s)
// they're actually changing.
const updateBudget = async (userId, id, { categoryId, period, limitAmount, currency }) => {
  const budget = await getBudgetById(userId, id)

  const updatedCategoryId = categoryId !== undefined ? categoryId : budget.category_id
  const updatedPeriod = period !== undefined ? period : budget.period
  const updatedLimit = limitAmount !== undefined ? Number(limitAmount) : Number(budget.limit_amount)
  const updatedCurrency = currency !== undefined ? currency : budget.currency

  if (!(updatedLimit > 0)) throw badRequest('limitAmount must be a positive number')
  if (typeof updatedPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(updatedPeriod)) throw badRequest('period must be in YYYY-MM format')
  if (!isValidCurrencyCode(updatedCurrency)) throw badRequest('A valid ISO 4217 currency code is required')
  if (categoryId !== undefined) await categoriesService.requireCategory(userId, updatedCategoryId)

  try {
    const result = await query(SQL.update, [updatedCategoryId, updatedPeriod, updatedLimit, updatedCurrency.toUpperCase(), budget.id])
    return result.rows[0]
  } catch (err) {
    if (err.code === '23505') throw conflict('A budget for this category and period already exists')
    throw err
  }
}

const deleteBudget = async (userId, id) => {
  const budget = await getBudgetById(userId, id)
  await query(SQL.delete, [budget.id])
}

// Which cycle a budget list is for, plus a readable label for it. Clients
// can't work this out from the calendar alone, since it depends on the
// user's cycle start day.
const describePeriod = async (userId, period) => {
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const key = period || periods.periodKeyForDate(cycleStartDay, new Date())
  const { start, end } = periods.periodKeyToBounds(cycleStartDay, key)
  return { period: key, periodLabel: periods.formatPeriodLabel(start, end, cycleStartDay) }
}

const listBudgetsWithUsage = async (userId, period) => {
  const effectivePeriod = period || (await currentPeriod(userId))
  const result = await query(SQL.listByPeriod, [userId, effectivePeriod])

  const budgets = []
  for (const budget of result.rows) {
    const { spent } = await aggregates.getSpentForCategoryPeriod(userId, budget.category_id, effectivePeriod, budget.currency)
    budgets.push({
      ...budget,
      spent,
      displayCurrency: budget.currency,
      isOverLimit: spent > Number(budget.limit_amount)
    })
  }
  return budgets
}

// Historical-average forecast: looks back up to 6 prior months of spend in
// this budget's category and averages the months that had any activity.
const getForecast = async (userId, budgetId) => {
  const budget = await getBudgetById(userId, budgetId)
  const LOOKBACK_MONTHS = 6

  const priorSpends = []
  for (let i = 1; i <= LOOKBACK_MONTHS; i += 1) {
    const period = shiftPeriod(budget.period, i)
    const { spent } = await aggregates.getSpentForCategoryPeriod(userId, budget.category_id, period, budget.currency)
    if (spent > 0) priorSpends.push(spent)
  }

  if (priorSpends.length === 0) {
    return { available: false, forecast: null }
  }

  const average = priorSpends.reduce((sum, value) => sum + value, 0) / priorSpends.length
  return { available: true, forecast: Math.round(average * 100) / 100 }
}

module.exports = { createBudget, getBudgetById, updateBudget, deleteBudget, describePeriod, listBudgetsWithUsage, getForecast }
