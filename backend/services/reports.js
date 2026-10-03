'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const aggregates = require('../shared/financialAggregates')
const periods = require('../shared/periods')
const accountsService = require('./accounts')
const investmentsService = require('./investments')
const currencyService = require('./currency')
const { badRequest } = require('../shared/utils')

const SQL = {
  getNetWorthAsOf: loadSql('reports/getNetWorthAsOf'),
  insertNetWorthSnapshot: loadSql('reports/insertNetWorthSnapshot'),
  listAllUserIds: loadSql('reports/listAllUserIds'),
  getNetWorthHistory: loadSql('reports/getNetWorthHistory')
}

const getTotalBalance = async (userId, displayCurrency) => {
  const accounts = await accountsService.listAccounts(userId)
  let total = 0
  let hasUnconverted = false
  for (const account of accounts) {
    const { amount, available } = await currencyService.convertAmount(Number(account.balance), account.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    total += amount
  }
  return { total: Math.round(total * 100) / 100, hasUnconverted }
}

// A simple, transparent heuristic (not a claim of financial-advice accuracy):
// a 0% savings rate scores 50, scaling toward 100 as savings rate approaches
// 100% and toward 0 as it goes negative, clamped to [0, 100].
const computeFinancialHealthScore = (savingsRate) => {
  const score = 50 + savingsRate * 50
  return Math.max(0, Math.min(100, Math.round(score)))
}

const pctChange = (from, to) => {
  if (!from) return null
  return Math.round(((to - from) / from) * 1000) / 10
}

// The net worth snapshot closest to (on or before) a given date — used to
// compare against a live "now" figure since account balances themselves
// have no history, only the daily net-worth snapshot does.
//
// A snapshot is tagged with whatever display_currency was active on the day
// it was taken, which can differ from the currency the caller wants to
// compare against if the user has changed their display currency since —
// comparing the raw stored numbers directly in that case silently mixes
// units (e.g. an old IDR figure vs. today's USD figure), which is exactly
// the "net worth went down just from switching currency" bug this
// conversion fixes.
const getNetWorthAsOf = async (userId, date, targetCurrency) => {
  const result = await query(SQL.getNetWorthAsOf, [userId, date.toISOString().slice(0, 10)])
  const row = result.rows[0]
  if (!row) return null
  const { amount, available } = await currencyService.convertAmount(Number(row.net_worth), row.display_currency, targetCurrency)
  return available ? amount : null
}

// Income/expense default to the user's current budget cycle (a calendar
// month starting on `budget_cycle_start_day`, day 1 by default) when no
// explicit range is given, so the dashboard reads as "this period" like a
// typical finance app summary — a caller that wants all-time totals can
// still pass an explicit wide range. `periodOffset` (0 = current cycle, 1 =
// the one before it) lets the dashboard's "Last Month / This Month" toggle
// reuse this same function instead of a separate endpoint.
//
// periodLabel is computed here (not derived by the client from periodStart)
// deliberately: a Date built at local midnight and serialized via
// toISOString() shifts to the previous day in UTC for any positive-offset
// server timezone, and re-parsing that on the client can land on the wrong
// month if the browser's timezone differs — the same class of bug fixed
// for net_worth_snapshots' dates. A plain label string sidesteps it.
const getDashboardSummary = async (userId, { startDate, endDate, periodOffset } = {}) => {
  let effectiveStartDate = startDate
  let effectiveEndDate = endDate
  let periodLabel = null
  let changes = null
  let start, end

  // Resolved once upfront (rather than only via getIncomeExpense's own
  // internal lookup) so the two getNetWorthAsOf calls below always convert
  // historical snapshots into the SAME currency as the rest of this
  // response, regardless of what currency was active when those snapshots
  // were taken.
  const displayCurrency = await accountsService.getDisplayCurrency(userId)

  if (!startDate && !endDate) {
    const offset = Number(periodOffset) === 1 ? 1 : 0
    const cycleStartDay = await accountsService.getCycleStartDay(userId)
    ;({ start, end } = periods.getPeriodBoundsForOffset(cycleStartDay, offset))
    const previousBounds = periods.getPeriodBoundsForOffset(cycleStartDay, offset + 1)
    effectiveStartDate = start.toISOString()
    effectiveEndDate = end.toISOString()
    periodLabel = periods.formatPeriodLabel(start, end, cycleStartDay)

    const previous = await aggregates.getIncomeExpense(userId, {
      startDate: previousBounds.start.toISOString(),
      endDate: previousBounds.end.toISOString()
    })
    const prevSavingsRate = previous.income > 0 ? Math.round(((previous.income - previous.expense) / previous.income) * 1000) / 10 : 0
    changes = {
      previous,
      prevSavingsRate,
      prevFinancialHealthScore: computeFinancialHealthScore(prevSavingsRate / 100),
      netWorthAtPeriodStart: await getNetWorthAsOf(userId, start, displayCurrency)
    }
  }

  const { income, expense, net, hasUnconverted: incomeUnconverted } =
    await aggregates.getIncomeExpense(userId, { startDate: effectiveStartDate, endDate: effectiveEndDate })
  const { total: totalBalance, hasUnconverted: balanceUnconverted } = await getTotalBalance(userId, displayCurrency)

  // The live current net worth for an ongoing cycle (offset 0); for a
  // closed past cycle, the snapshot as of that cycle's end reads as "what it
  // was then" instead of today's live figure.
  const liveNetWorth = await accountsService.getNetWorth(userId)
  const netWorth = (end && end < new Date())
    ? (await getNetWorthAsOf(userId, end, displayCurrency)) ?? liveNetWorth.netWorth
    : liveNetWorth.netWorth

  const savingsRate = income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0
  const financialHealthScore = computeFinancialHealthScore(savingsRate / 100)

  return {
    displayCurrency,
    totalBalance,
    income,
    expense,
    net,
    savingsRate,
    netWorth,
    financialHealthScore,
    periodLabel,
    periodOffset: Number(periodOffset) === 1 ? 1 : 0,
    changes: changes && {
      income: pctChange(changes.previous.income, income),
      expense: pctChange(changes.previous.expense, expense),
      savingsRate: pctChange(changes.prevSavingsRate, savingsRate),
      financialHealthScore: pctChange(changes.prevFinancialHealthScore, financialHealthScore),
      netWorth: changes.netWorthAtPeriodStart !== null ? pctChange(changes.netWorthAtPeriodStart, netWorth) : null
    },
    hasUnconverted: incomeUnconverted || balanceUnconverted || !liveNetWorth.fullyConverted
  }
}

const getCashFlow = async (userId, { startDate, endDate }) => {
  if (!startDate || !endDate) throw badRequest('startDate and endDate are required')
  return aggregates.getIncomeExpense(userId, { startDate, endDate })
}

const getExpenseBreakdown = async (userId, { startDate, endDate, categoryId }) =>
  aggregates.getExpenseBreakdown(userId, { startDate, endDate, categoryId })

const getTrends = async (userId, months) => aggregates.getMonthlyTrend(userId, months)

const LIABILITY_TYPES = new Set(['credit_card'])

// Groups active accounts by type, plus investment holdings broken out by
// their allocation category (falling back to asset name when a holding has
// no category), matching the granularity used by the Target Allocation
// comparison instead of one combined "investments" group (design.md
// Decision 2, superseded).
const getAssetAllocation = async (userId) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const accounts = await accountsService.listAccounts(userId)
  const netWorthResult = await accountsService.getNetWorth(userId)

  const totalsByType = new Map()
  let hasUnconverted = false

  for (const account of accounts) {
    const { amount, available } = await currencyService.convertAmount(Number(account.balance), account.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    const signedAmount = LIABILITY_TYPES.has(account.type) ? -amount : amount
    totalsByType.set(account.type, (totalsByType.get(account.type) || 0) + signedAmount)
  }

  const portfolio = await investmentsService.getPortfolio(userId)
  if (portfolio.hasUnconverted) hasUnconverted = true
  for (const holding of portfolio.holdings) {
    if (holding.currentValue === null) continue
    const key = (holding.category && holding.category.trim()) || holding.asset_name
    totalsByType.set(key, (totalsByType.get(key) || 0) + holding.currentValue)
  }

  const netWorth = netWorthResult.netWorth
  const allocation = Array.from(totalsByType.entries()).map(([type, amount]) => ({
    type,
    amount: Math.round(amount * 100) / 100,
    percentage: netWorth !== 0 ? Math.round((amount / netWorth) * 1000) / 10 : 0
  }))

  return { displayCurrency, netWorth, allocation, hasUnconverted: hasUnconverted || !netWorthResult.fullyConverted }
}

// Scheduled once daily (design.md Decision 3) — daily granularity is enough
// for a "trend over time" chart without adding a second cadence for writes.
const takeNetWorthSnapshot = async (userId) => {
  const { netWorth, displayCurrency } = await accountsService.getNetWorth(userId)
  await query(SQL.insertNetWorthSnapshot, [userId, netWorth, displayCurrency])
}

const takeAllUsersNetWorthSnapshots = async () => {
  const users = await query(SQL.listAllUserIds)
  for (const user of users.rows) {
    try {
      await takeNetWorthSnapshot(user.id)
    } catch (err) {
      console.error(`Failed to snapshot net worth for user ${user.id}:`, err.message)
    }
  }
}

// Runs on every server startup, not just when today has no snapshot yet —
// takeNetWorthSnapshot is now an upsert (net_worth_snapshots has a unique
// (user_id, snapshot_date) constraint — see migration 030), so re-running it
// just refreshes today's numbers to the current net worth. This also means
// an account/holding added later the same day gets reflected on the next
// restart instead of waiting until tomorrow. Still needed instead of relying
// solely on the fixed 01:15 cron, since a server that's only up during
// active use (not left running overnight) would rarely ever actually hit
// that time, leaving Net Worth History full of gaps.
const catchUpAllUsersNetWorthSnapshots = async () => {
  const users = await query(SQL.listAllUserIds)
  for (const user of users.rows) {
    try {
      await takeNetWorthSnapshot(user.id)
    } catch (err) {
      console.error(`Failed to catch up net worth snapshot for user ${user.id}:`, err.message)
    }
  }
}

// snapshot_date is selected via TO_CHAR rather than returned as a DATE value
// because node-postgres parses DATE columns into a JS Date at local midnight;
// serializing that to JSON converts it to UTC and can shift it back a whole
// calendar day depending on the server's timezone offset.
// Each row is tagged with whatever display_currency was active on the day
// it was snapshotted. Returning those raw values as-is would mix units the
// moment a user ever changes their display currency — every point before
// the switch stays in the old currency, every point after in the new one —
// producing a chart with a nonsensical cliff/jump exactly on that date and
// wrong "This Month/This Year/All-Time" % changes on the frontend. Every
// point is converted into the CURRENT display currency here instead, so the
// whole series is always in one consistent unit.
const getNetWorthHistory = async (userId) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const result = await query(SQL.getNetWorthHistory, [userId])

  const history = []
  for (const row of result.rows) {
    const { amount, available } = await currencyService.convertAmount(Number(row.net_worth), row.display_currency, displayCurrency)
    history.push({
      date: row.snapshot_date,
      netWorth: available ? amount : Number(row.net_worth),
      displayCurrency: available ? displayCurrency : row.display_currency
    })
  }
  return history
}

module.exports = {
  getDashboardSummary,
  getCashFlow,
  getExpenseBreakdown,
  getTrends,
  getAssetAllocation,
  takeNetWorthSnapshot,
  takeAllUsersNetWorthSnapshots,
  catchUpAllUsersNetWorthSnapshots,
  getNetWorthHistory
}
