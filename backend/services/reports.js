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
  getNetWorthHistory: loadSql('reports/getNetWorthHistory'),
  listCarriedOverTransactions: loadSql('reports/listCarriedOverTransactions')
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

// Share of income kept, in %; null (not 0%) when there was no income to keep.
const savingsRateOf = ({ income, expense }) => (
  income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : null
)

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

// Net effect (income minus expense, in the display currency) of the
// transactions that arrived before `boundary` but count in the cycle starting
// there. Net worth follows real dates, so an early salary lifts the previous
// cycle's net worth; subtracting this at each cycle edge moves it back into
// the cycle it was budgeted for when comparing net worth cycle to cycle.
const getCarriedOverAmount = async (userId, boundary, displayCurrency) => {
  const result = await query(SQL.listCarriedOverTransactions, [userId, boundary])
  let total = 0
  for (const row of result.rows) {
    const { amount, available } = await currencyService.convertAmount(Number(row.amount), row.currency, displayCurrency)
    if (!available) continue
    total += row.type === 'expense' ? -amount : amount
  }
  return total
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
    const prevSavingsRate = savingsRateOf(previous)
    changes = {
      previous,
      prevSavingsRate,
      prevFinancialHealthScore: computeFinancialHealthScore((prevSavingsRate ?? 0) / 100),
      netWorthAtPeriodStart: await getNetWorthAsOf(userId, start, displayCurrency),
      carriedIntoPeriod: await getCarriedOverAmount(userId, start, displayCurrency),
      // end is 23:59:59 the day before the next cycle starts.
      carriedOutOfPeriod: await getCarriedOverAmount(userId, new Date(end.getTime() + 1000), displayCurrency)
    }
  }

  const { income, expense, net, hasUnconverted: incomeUnconverted } =
    await aggregates.getIncomeExpense(userId, { startDate: effectiveStartDate, endDate: effectiveEndDate })
  const { total: totalBalance, hasUnconverted: balanceUnconverted } = await getTotalBalance(userId, displayCurrency)

  // The live current net worth for an ongoing cycle (offset 0); for a
  // closed past cycle, the snapshot as of that cycle's end reads as "what it
  // was then" instead of today's live figure.
  const liveNetWorth = await accountsService.getNetWorth(userId)
  const actualNetWorth = (end && end < new Date())
    ? (await getNetWorthAsOf(userId, end, displayCurrency)) ?? liveNetWorth.netWorth
    : liveNetWorth.netWorth

  // Net worth reads by budget cycle, like income and expense: money that
  // arrived before the cycle ended but counts in the next one (see
  // getCarriedOverAmount) belongs to that next cycle, in both the figure and
  // its change, so the two never point in opposite directions. The
  // day-by-day real figure stays on the Reports net worth history.
  const netWorth = changes
    ? Math.round((actualNetWorth - changes.carriedOutOfPeriod) * 100) / 100
    : actualNetWorth

  const savingsRate = savingsRateOf({ income, expense })
  const financialHealthScore = computeFinancialHealthScore((savingsRate ?? 0) / 100)

  // A cycle with nothing recorded yet (e.g. its first day) has nothing to
  // compare, so income/expense/savings/health show no change rather than a
  // misleading "-100%". Net worth still compares, since it never resets.
  const periodIsEmpty = income === 0 && expense === 0

  const netWorthChange = changes && changes.netWorthAtPeriodStart !== null
    ? pctChange(changes.netWorthAtPeriodStart - changes.carriedIntoPeriod, netWorth)
    : null

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
      income: periodIsEmpty ? null : pctChange(changes.previous.income, income),
      expense: periodIsEmpty ? null : pctChange(changes.previous.expense, expense),
      // Savings rate is already a percentage, so its change is the difference
      // in percentage points (47.8% → 100% is +52.2), not a percent of a percent.
      savingsRate: periodIsEmpty || savingsRate === null || changes.prevSavingsRate === null
        ? null
        : Math.round((savingsRate - changes.prevSavingsRate) * 10) / 10,
      financialHealthScore: periodIsEmpty ? null : pctChange(changes.prevFinancialHealthScore, financialHealthScore),
      netWorth: netWorthChange
    },
    hasUnconverted: incomeUnconverted || balanceUnconverted || !liveNetWorth.fullyConverted
  }
}

const getCashFlow = async (userId, { startDate, endDate }) => {
  if (!startDate || !endDate) throw badRequest('startDate and endDate are required')
  return aggregates.getIncomeExpense(userId, { startDate, endDate })
}

const getExpenseBreakdown = async (userId, { startDate, endDate, categoryId, periodOffset }) =>
  aggregates.getExpenseBreakdown(userId, { startDate, endDate, categoryId, periodOffset })

const getCycleTrend = async (userId, { periodOffset } = {}) => aggregates.getCycleTrend(userId, { periodOffset })

const getTrends = async (userId, months) => aggregates.getMonthlyTrend(userId, months)

// Groups active accounts by type, plus investment holdings broken out by
// their allocation category (falling back to asset name when a holding has
// no category), matching the granularity used by the Target Allocation
// comparison instead of one combined "investments" group (design.md
// Decision 2, superseded).
//
// periodOffset 1 shows the allocation at the end of the previous budget
// cycle instead of now: each account's balance as of that day (from its
// statement) and each holding's last saved value by then.
const getAssetAllocation = async (userId, { periodOffset } = {}) => {
  if (Number(periodOffset) === 1) return getAssetAllocationAsOfLastCycle(userId)
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const accounts = await accountsService.listAccounts(userId)
  const netWorthResult = await accountsService.getNetWorth(userId)

  const totalsByType = new Map()
  let hasUnconverted = false

  for (const account of accounts) {
    const { amount, available } = await currencyService.convertAmount(Number(account.balance), account.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    totalsByType.set(account.type, (totalsByType.get(account.type) || 0) + amount)
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

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const getAssetAllocationAsOfLastCycle = async (userId) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const asOf = toDateKey(periods.getPeriodBoundsForOffset(cycleStartDay, 1).end)

  const { values: totalsByType, hasUnconverted } = await investmentsService.getAllocationValuesAsOf(userId, asOf, displayCurrency)

  const total = Array.from(totalsByType.values()).reduce((sum, v) => sum + v, 0)
  const allocation = Array.from(totalsByType.entries())
    .filter(([, amount]) => Math.abs(amount) >= 0.005)
    .map(([type, amount]) => ({
      type,
      amount: Math.round(amount * 100) / 100,
      percentage: total !== 0 ? Math.round((amount / total) * 1000) / 10 : 0
    }))

  return { displayCurrency, netWorth: Math.round(total * 100) / 100, allocation, asOf, hasUnconverted }
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

const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])$/
const round2 = (n) => Math.round(n * 100) / 100
const COMPARE_CYCLES = 12

// Income, expense and spending by category for two budget cycles side by
// side ('YYYY-MM' keys; by default the current cycle against the one before
// it), plus the last 12 cycles to choose from.
const getCycleComparison = async (userId, { a, b } = {}) => {
  for (const key of [a, b]) {
    if (key && !PERIOD_KEY.test(key)) throw badRequest('Periods must be in YYYY-MM format')
  }
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const options = []
  for (let offset = 0; offset < COMPARE_CYCLES; offset++) {
    const { start, end } = periods.getPeriodBoundsForOffset(cycleStartDay, offset)
    options.push({ period: periods.periodKeyForDate(cycleStartDay, start), label: periods.formatPeriodLabel(start, end, cycleStartDay) })
  }

  const describe = async (key) => {
    const { start, end } = periods.periodKeyToBounds(cycleStartDay, key)
    const range = { startDate: start.toISOString(), endDate: end.toISOString() }
    const totals = await aggregates.getIncomeExpense(userId, range)
    const breakdown = await aggregates.getExpenseBreakdown(userId, range)
    return {
      period: key,
      label: periods.formatPeriodLabel(start, end, cycleStartDay),
      income: totals.income,
      expense: totals.expense,
      net: totals.net,
      categories: breakdown.breakdown,
      hasUnconverted: totals.hasUnconverted || breakdown.hasUnconverted
    }
  }
  const first = await describe(a || options[0].period)
  const second = await describe(b || options[1].period)

  // One row per category spent on in either cycle, biggest first.
  const rows = new Map()
  for (const [side, cycle] of [['a', first], ['b', second]]) {
    for (const c of cycle.categories) {
      const key = c.categoryId ?? 'uncategorized'
      const row = rows.get(key) || { categoryId: c.categoryId, categoryName: c.categoryName, a: 0, b: 0 }
      row[side] = c.amount
      rows.set(key, row)
    }
  }
  const categories = Array.from(rows.values())
    .map((row) => ({ ...row, change: round2(row.a - row.b), changePercentage: row.b > 0 ? Math.round(((row.a - row.b) / row.b) * 1000) / 10 : null }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b))

  const strip = ({ categories: _omit, ...cycle }) => cycle
  return {
    displayCurrency: await accountsService.getDisplayCurrency(userId),
    a: strip(first),
    b: strip(second),
    categories,
    options
  }
}

// How much of what you own is in each currency (accounts at their balance,
// holdings at their market value, both in their own currency), and how much
// exchange-rate moves since the start of a budget cycle have changed its
// worth in the display currency: today's amounts valued at today's rates
// versus at the rates in effect when that cycle began.
const getCurrencyExposure = async (userId, { sinceOffset } = {}) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const positions = new Map()
  const add = (currency, amount, name, kind) => {
    const position = positions.get(currency) || { currency, amount: 0, items: [] }
    position.amount += amount
    position.items.push({ name, kind, amount: round2(amount) })
    positions.set(currency, position)
  }
  for (const account of await accountsService.listAccounts(userId)) add(account.currency, Number(account.balance), account.name, 'account')
  const portfolio = await investmentsService.getPortfolio(userId)
  for (const holding of portfolio.holdings) add(holding.currency, Number(holding.quantity) * Number(holding.current_price), holding.asset_name, 'holding')

  let total = 0
  const exposure = []
  // Currencies with no exchange rate can't be valued, so they're listed
  // apart instead of quietly left out of the percentages.
  const unconverted = []
  for (const position of positions.values()) {
    const { amount, available } = await currencyService.convertAmount(position.amount, position.currency, displayCurrency)
    if (!available) { unconverted.push(position.currency); continue }
    total += amount
    exposure.push({ ...position, amount: round2(position.amount), value: amount })
  }
  for (const e of exposure) e.percentage = total !== 0 ? Math.round((e.value / total) * 1000) / 10 : 0
  exposure.sort((x, y) => y.value - x.value)

  // Cycle starts the rate history reaches back to.
  const firstRateDate = await currencyService.getFirstRateDate()
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const sinceOptions = []
  for (let offset = 0; offset < 6 && firstRateDate; offset++) {
    const { start, end } = periods.getPeriodBoundsForOffset(cycleStartDay, offset)
    const date = toDateKey(start)
    if (date < firstRateDate) break
    sinceOptions.push({ offset, date, label: periods.formatPeriodLabel(start, end, cycleStartDay) })
  }
  const since = sinceOptions.find((o) => o.offset === Number(sinceOffset)) || sinceOptions[0] || null

  let fxImpact = null
  if (since) {
    const byCurrency = []
    const noHistory = []
    let impactTotal = 0
    for (const e of exposure) {
      if (e.currency === displayCurrency) continue
      const then = await currencyService.convertAmountAsOf(e.amount, e.currency, displayCurrency, since.date)
      // Rates per one unit, converted from a million so small ones (e.g.
      // IDR into USD) keep their precision past two decimals.
      const rateNow = await currencyService.convertAmount(1_000_000, e.currency, displayCurrency)
      const rateThen = await currencyService.convertAmountAsOf(1_000_000, e.currency, displayCurrency, since.date)
      if (!then.available || !rateNow.available || !rateThen.available) { noHistory.push(e.currency); continue }
      const impact = round2(e.value - then.amount)
      impactTotal += impact
      byCurrency.push({
        currency: e.currency,
        rateThen: rateThen.amount / 1_000_000,
        rateNow: rateNow.amount / 1_000_000,
        rateChangePercentage: rateThen.amount ? Math.round(((rateNow.amount - rateThen.amount) / rateThen.amount) * 1000) / 10 : null,
        impact
      })
    }
    fxImpact = { total: round2(impactTotal), byCurrency, noHistory }
  }

  return { displayCurrency, total: round2(total), exposure, since, sinceOptions, fxImpact, unconverted, hasUnconverted: unconverted.length > 0 }
}

module.exports = {
  getCycleComparison,
  getCurrencyExposure,
  getDashboardSummary,
  getCashFlow,
  getExpenseBreakdown,
  getCycleTrend,
  getTrends,
  getAssetAllocation,
  takeNetWorthSnapshot,
  takeAllUsersNetWorthSnapshots,
  catchUpAllUsersNetWorthSnapshots,
  getNetWorthHistory
}
