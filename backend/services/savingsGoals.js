'use strict'
const { query, withTransaction } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, assertOwned } = require('../shared/utils')
const { isValidCurrencyCode } = require('../shared/currencyCodes')
const accountsService = require('./accounts')
const investmentsService = require('./investments')
const currencyService = require('./currency')
const aggregates = require('../shared/financialAggregates')
const { resolveEntryTime } = require('../shared/entryDate')

const SQL = {
  create: loadSql('savingsGoals/create'),
  update: loadSql('savingsGoals/update'),
  getById: loadSql('savingsGoals/getById'),
  insertContribution: loadSql('savingsGoals/insertContribution'),
  increaseSavedAmount: loadSql('savingsGoals/increaseSavedAmount'),
  decreaseSavedAmount: loadSql('savingsGoals/decreaseSavedAmount'),
  delete: loadSql('savingsGoals/delete'),
  list: loadSql('savingsGoals/list'),
  listSources: loadSql('savingsGoals/listSources'),
  deleteSources: loadSql('savingsGoals/deleteSources'),
  insertSource: loadSql('savingsGoals/insertSource'),
  sumContributionsSince: loadSql('savingsGoals/sumContributionsSince'),
  getHistoryStartDate: loadSql('investments/getHistoryStartDate'),
  getHoldingValueAsOf: loadSql('investments/getHoldingValueAsOf')
}

const DAYS_PER_MONTH = 30.44
// How far back the recent saving pace is measured, and the least history
// needed before a pace is worth showing.
const PACE_WINDOW_DAYS = 90
const MIN_PACE_DAYS = 14

const round2 = (n) => Math.round(n * 100) / 100
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysBetween = (fromKey, toKey) => Math.round((new Date(`${toKey}T00:00:00`) - new Date(`${fromKey}T00:00:00`)) / 86400000)

// Sources arrive as [{ type: 'account' | 'holding', id, amount? }]; amount
// (optional) counts only up to that much of the account or holding.
const validateSources = async (userId, sources) => {
  if (sources === undefined || sources === null) return []
  if (!Array.isArray(sources)) throw badRequest('sources must be a list')
  const seen = new Set()
  const valid = []
  for (const source of sources) {
    if (!source || !['account', 'holding'].includes(source.type)) throw badRequest("Each source's type must be 'account' or 'holding'")
    const id = Number(source.id)
    if (!Number.isInteger(id)) throw badRequest('Each source needs an id')
    const key = `${source.type}:${id}`
    if (seen.has(key)) throw badRequest('The same account or holding is listed twice')
    seen.add(key)
    const amount = source.amount === undefined || source.amount === null || source.amount === '' ? null : Number(source.amount)
    if (amount !== null && !(amount > 0)) throw badRequest('A source amount must be a positive number')
    if (source.type === 'account') await accountsService.getAccountById(userId, id)
    else await investmentsService.getHoldingById(userId, id)
    valid.push({ type: source.type, id, amount })
  }
  return valid
}

const validateGoalFields = ({ name, targetAmount, currency }) => {
  if (typeof name !== 'string' || name.trim() === '') throw badRequest('Goal name is required')
  const numericTarget = Number(targetAmount)
  if (!(numericTarget > 0)) throw badRequest('targetAmount must be a positive number')
  if (currency !== undefined && currency !== null && !isValidCurrencyCode(currency)) throw badRequest('A valid ISO 4217 currency code is required')
  return numericTarget
}

const saveSources = async (client, goalId, sources) => {
  await client.query(SQL.deleteSources, [goalId])
  for (const source of sources) {
    await client.query(SQL.insertSource, [
      goalId,
      source.type === 'account' ? source.id : null,
      source.type === 'holding' ? source.id : null,
      source.amount
    ])
  }
}

// A goal with sources counts in the first account source's currency unless
// one is given; otherwise the display currency.
const defaultCurrency = async (userId, sources, accountId) => {
  const firstAccount = sources.find((s) => s.type === 'account')
  const id = firstAccount?.id ?? accountId
  if (id) return (await accountsService.getAccountById(userId, id)).currency
  return accountsService.getDisplayCurrency(userId)
}

const createGoal = async (userId, { name, targetAmount, targetDate, accountId, currency, sources }) => {
  const numericTarget = validateGoalFields({ name, targetAmount, currency })
  const validSources = await validateSources(userId, sources)
  const goalCurrency = currency || await defaultCurrency(userId, validSources, accountId)

  return withTransaction(async (client) => {
    const result = await client.query(SQL.create, [userId, name.trim(), numericTarget, targetDate || null, accountId || null, goalCurrency])
    await saveSources(client, result.rows[0].id, validSources)
    return result.rows[0]
  })
}

// Name, target, date and currency are replaced; sources only when given
// (an empty list turns the goal back into a hand-tracked one).
const updateGoal = async (userId, id, { name, targetAmount, targetDate, currency, sources }) => {
  const goal = await getGoalById(userId, id)
  const numericTarget = validateGoalFields({ name, targetAmount, currency })
  const validSources = sources === undefined ? null : await validateSources(userId, sources)

  return withTransaction(async (client) => {
    const result = await client.query(SQL.update, [name.trim(), numericTarget, targetDate || null, currency || goal.currency, goal.id])
    if (validSources) await saveSources(client, goal.id, validSources)
    return result.rows[0]
  })
}

const getGoalById = async (userId, id) => {
  const result = await query(SQL.getById, [id])
  return assertOwned(result.rows[0], userId, 'Savings goal not found')
}

const hasSources = async (userId, goalId) => {
  const result = await query(SQL.listSources, [userId])
  return result.rows.some((s) => s.goal_id === goalId)
}

// date (optional, YYYY-MM-DD): when the money was actually set aside or taken back.
// Only for hand-tracked goals — a linked goal follows its accounts and holdings.
const contribute = async (userId, id, amount, date) => {
  const occurredAt = resolveEntryTime(date)
  const numericAmount = Number(amount)
  if (!(numericAmount > 0)) throw badRequest('Contribution amount must be a positive number')
  const goal = await getGoalById(userId, id)
  if (await hasSources(userId, goal.id)) throw badRequest('This goal follows its linked accounts and holdings, so it updates on its own')

  return withTransaction(async (client) => {
    await client.query(SQL.insertContribution, [goal.id, numericAmount, occurredAt])
    const result = await client.query(SQL.increaseSavedAmount, [numericAmount, goal.id])
    return result.rows[0]
  })
}

const withdraw = async (userId, id, amount, date) => {
  const occurredAt = resolveEntryTime(date)
  const numericAmount = Number(amount)
  if (!(numericAmount > 0)) throw badRequest('Withdrawal amount must be a positive number')
  const goal = await getGoalById(userId, id)
  if (await hasSources(userId, goal.id)) throw badRequest('This goal follows its linked accounts and holdings, so it updates on its own')
  if (numericAmount > Number(goal.saved_amount)) {
    throw badRequest('Withdrawal amount exceeds the amount saved toward this goal')
  }

  return withTransaction(async (client) => {
    await client.query(SQL.insertContribution, [goal.id, -numericAmount, occurredAt])
    const result = await client.query(SQL.decreaseSavedAmount, [numericAmount, goal.id])
    return result.rows[0]
  })
}

const deleteGoal = async (userId, id) => {
  const goal = await getGoalById(userId, id)
  await query(SQL.delete, [goal.id])
}

// What one source counts toward its goal, in the goal's currency: the
// account balance or holding value (today, or as of a past date), capped at
// the source's amount when it has one. null when it can't be valued then.
const valueSource = async (userId, source, goalCurrency, asOf) => {
  let amount
  let currency
  if (source.account_id) {
    const account = await accountsService.getAccountById(userId, source.account_id)
    amount = asOf
      ? (await accountsService.getStatement(userId, account.id, { endDate: asOf })).closingBalance
      : Number(account.balance)
    currency = account.currency
  } else {
    const holding = await investmentsService.getHoldingById(userId, source.holding_id)
    if (asOf) {
      const row = (await query(SQL.getHoldingValueAsOf, [holding.id, asOf])).rows[0]
      if (!row) return 0
      amount = Number(row.value)
      currency = row.display_currency
    } else {
      amount = Number(holding.quantity) * Number(holding.current_price)
      currency = holding.currency
    }
  }
  const converted = await currencyService.convertAmount(amount, currency, goalCurrency)
  if (!converted.available) return null
  const value = Math.max(0, converted.amount)
  // A source's amount is set in the goal's currency.
  if (source.amount === null || source.amount === undefined) return value
  return Math.min(value, Number(source.amount))
}

const sourceName = async (userId, source) => (source.account_id
  ? (await accountsService.getAccountById(userId, source.account_id)).name
  : (await investmentsService.getHoldingById(userId, source.holding_id)).asset_name)

// Remaining amount, the monthly saving needed to hit the target date, the
// recent saving pace, when the goal would be reached at that pace, and a
// status: complete, on_track, behind, overdue (date passed), or no_date.
const buildPlan = ({ saved, target, targetDate, savedThen, paceDays, today }) => {
  const remaining = Math.max(0, target - saved)
  const pacePerMonth = savedThen !== null && paceDays >= MIN_PACE_DAYS
    ? round2((saved - savedThen) / (paceDays / DAYS_PER_MONTH))
    : null
  const targetKey = targetDate ? dateKey(new Date(targetDate)) : null
  const monthsLeft = targetKey ? daysBetween(today, targetKey) / DAYS_PER_MONTH : null
  const neededPerMonth = remaining > 0 && monthsLeft !== null && monthsLeft > 0 ? round2(remaining / monthsLeft) : null

  let projectedDate = null
  if (remaining > 0 && pacePerMonth > 0) {
    const days = (remaining / pacePerMonth) * DAYS_PER_MONTH
    if (days < 365 * 50) {
      const d = new Date(`${today}T00:00:00`)
      d.setDate(d.getDate() + Math.ceil(days))
      projectedDate = dateKey(d)
    }
  }

  let status
  if (remaining <= 0) status = 'complete'
  else if (!targetKey) status = 'no_date'
  else if (monthsLeft <= 0) status = 'overdue'
  else if (pacePerMonth === null) status = 'unknown'
  else status = pacePerMonth >= neededPerMonth * 0.98 ? 'on_track' : 'behind'

  return {
    remaining: round2(remaining),
    monthsLeft: monthsLeft === null ? null : Math.round(monthsLeft * 10) / 10,
    neededPerMonth,
    pacePerMonth,
    projectedDate,
    status
  }
}

const listGoals = async (userId) => {
  const result = await query(SQL.list, [userId])
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const sourcesResult = await query(SQL.listSources, [userId])
  const historyStart = (await query(SQL.getHistoryStartDate, [userId])).rows[0]?.start_date || null

  const today = dateKey(new Date())
  const windowStartDate = new Date()
  windowStartDate.setDate(windowStartDate.getDate() - PACE_WINDOW_DAYS)
  const defaultWindowStart = dateKey(windowStartDate)

  const goals = []
  for (const goal of result.rows) {
    const currency = goal.currency || displayCurrency
    const target = Number(goal.target_amount)
    const sources = sourcesResult.rows.filter((s) => s.goal_id === goal.id)

    let saved
    let savedThen = null
    let windowStart = defaultWindowStart
    const sourceDetails = []

    if (sources.length > 0) {
      // Linked: today's value of every source, and their value at the start
      // of the pace window (no earlier than the app's saved history).
      if (historyStart && historyStart > windowStart) windowStart = historyStart
      saved = 0
      savedThen = 0
      for (const source of sources) {
        const value = await valueSource(userId, source, currency, null)
        const valueThen = historyStart ? await valueSource(userId, source, currency, windowStart) : null
        saved += value ?? 0
        if (valueThen === null) savedThen = null
        else if (savedThen !== null) savedThen += valueThen
        sourceDetails.push({
          type: source.account_id ? 'account' : 'holding',
          id: source.account_id || source.holding_id,
          name: await sourceName(userId, source),
          amount: source.amount === null ? null : Number(source.amount),
          value: value === null ? null : round2(value)
        })
      }
    } else {
      // Hand-tracked: the stored total, and what it was before the entries
      // made inside the pace window.
      saved = Number(goal.saved_amount)
      const created = dateKey(new Date(goal.created_at))
      const contributions = (await query(SQL.sumContributionsSince, [goal.id, windowStart])).rows[0]
      const firstDate = contributions.first_date && contributions.first_date < created ? contributions.first_date : created
      if (firstDate > windowStart) windowStart = firstDate
      const addedSince = Number((await query(SQL.sumContributionsSince, [goal.id, windowStart])).rows[0].added_since)
      savedThen = saved - addedSince
    }

    saved = round2(saved)
    goals.push({
      ...goal,
      currency,
      mode: sources.length > 0 ? 'linked' : 'manual',
      saved_amount: saved,
      sources: sourceDetails,
      progressPercentage: Math.round((saved / target) * 1000) / 10,
      isComplete: saved >= target,
      plan: buildPlan({ saved, target, targetDate: goal.target_date, savedThen, paceDays: daysBetween(windowStart, today), today })
    })
  }
  return goals
}

// A starting point for an emergency fund: the average spent per budget
// cycle over the last three finished cycles (cycles with no spending left
// out), in the display currency.
const getSuggestions = async (userId) => {
  const trend = await aggregates.getMonthlyTrend(userId, 4)
  const finished = trend.slice(0, -1).filter((t) => t.expense > 0)
  const averageMonthlyExpense = finished.length > 0
    ? round2(finished.reduce((sum, t) => sum + t.expense, 0) / finished.length)
    : null
  return {
    displayCurrency: await accountsService.getDisplayCurrency(userId),
    averageMonthlyExpense,
    cyclesCounted: finished.length
  }
}

module.exports = { createGoal, updateGoal, getGoalById, contribute, withdraw, deleteGoal, listGoals, getSuggestions }
