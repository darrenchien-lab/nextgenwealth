'use strict'
const { query, pool, withTransaction } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, assertOwned } = require('../shared/utils')
const { isValidCurrencyCode } = require('../shared/currencyCodes')
const currencyService = require('./currency')
const accountsService = require('./accounts')

// current_price is stored as NUMERIC(24,8) — 8 digits are reserved for the
// decimal part, so the integer part must stay under 16 digits (< 10^16,
// comfortably past a trillion). Checked here rather than left to the
// database, so a mistyped extra zero surfaces as a clear validation
// message instead of a raw "Internal server error" from the Postgres driver.
const MAX_PRICE = 9_999_999_999_999_999.99999999

const assertValidPrice = (value, fieldName) => {
  if (value > MAX_PRICE) {
    throw badRequest(`${fieldName} is too large — must be less than 10,000,000,000,000,000`)
  }
}

const SQL = {
  create: loadSql('investments/create'),
  getById: loadSql('investments/getById'),
  updatePrice: loadSql('investments/updatePrice'),
  listOpenForUser: loadSql('investments/listOpenForUser'),
  rename: loadSql('investments/rename'),
  setCategory: loadSql('investments/setCategory'),
  setPurchasedAt: loadSql('investments/setPurchasedAt'),
  addToHolding: loadSql('investments/addToHolding'),
  removeQuantity: loadSql('investments/removeQuantity'),
  deleteAllocationTargets: loadSql('investments/deleteAllocationTargets'),
  insertAllocationTarget: loadSql('investments/insertAllocationTarget'),
  setTargetCagr: loadSql('investments/setTargetCagr'),
  listAllocationTargets: loadSql('investments/listAllocationTargets'),
  getTargetCagr: loadSql('investments/getTargetCagr'),
  insertOrUpdateSnapshot: loadSql('investments/insertOrUpdateSnapshot'),
  getHistory: loadSql('investments/getHistory'),
  listAllUserIds: loadSql('investments/listAllUserIds'),
  insertOrUpdateHoldingSnapshot: loadSql('investments/insertOrUpdateHoldingSnapshot'),
  getHoldingsHistory: loadSql('investments/getHoldingsHistory'),
  listCategoriesByHolding: loadSql('investments/listCategoriesByHolding'),
  logTransaction: loadSql('investments/logTransaction'),
  listTransactions: loadSql('investments/listTransactions')
}

// Records one row in the investment_transactions "mutasi" log — called
// inside the same withTransaction block as the holding/balance change it
// documents, so a buy or sell can never exist without its log entry (or
// vice versa). realizedGain is only meaningful for a 'sell'.
const logInvestmentTransaction = (client, { userId, holdingId, assetName, category, type, quantity, pricePerUnit, totalAmount, currency, realizedGain, accountId }) => (
  client.query(SQL.logTransaction, [
    userId, holdingId, assetName, category || null, type, quantity, pricePerUnit, totalAmount, currency, realizedGain ?? null, accountId || null
  ])
)

// accountId is optional — when given, the purchase (quantity × costBasis,
// which the caller should already have folded any brokerage/exchange fee
// into) is deducted from that account's balance in the same transaction as
// the holding is created, so the two can never drift apart the way a
// manually-remembered separate expense entry can (design.md — same
// reasoning as bills' optional linked account). Deliberately requires the
// account's currency to match the holding's currency rather than silently
// auto-converting: the deducted amount must be the exact real amount that
// left that account, not a rate-dependent estimate.
const addHolding = async (userId, { assetName, assetType, quantity, currency, costBasis, category, purchasedAt, accountId }) => {
  if (typeof assetName !== 'string' || assetName.trim() === '') throw badRequest('assetName is required')
  if (typeof assetType !== 'string' || assetType.trim() === '') throw badRequest('assetType is required')
  const numericQuantity = Number(quantity)
  if (!(numericQuantity > 0)) throw badRequest('quantity must be a positive number')
  if (!isValidCurrencyCode(currency)) throw badRequest('A valid ISO 4217 currency code is required')
  if (costBasis !== undefined && costBasis !== null && costBasis !== '' && Number(costBasis) < 0) {
    throw badRequest('costBasis cannot be negative')
  }
  const numericCostBasis = Number(costBasis) || 0
  assertValidPrice(numericCostBasis, 'costBasis')
  const trimmedCategory = typeof category === 'string' && category.trim() !== '' ? category.trim() : null
  const totalSpent = numericQuantity * numericCostBasis

  const insertParams = [userId, assetName.trim(), assetType.trim(), numericQuantity, currency.toUpperCase(), totalSpent, numericCostBasis, trimmedCategory, purchasedAt || null]

  let account = null
  if (accountId !== undefined && accountId !== null && accountId !== '') {
    account = await accountsService.getAccountById(userId, accountId)
    if (account.currency !== currency.toUpperCase()) {
      throw badRequest(`Linked account is in ${account.currency}, but this holding is in ${currency.toUpperCase()} — link an account with the same currency, or leave the account unlinked`)
    }
  }

  const created = await withTransaction(async (client) => {
    const result = await client.query(SQL.create, insertParams)
    const holding = result.rows[0]
    if (account) {
      await accountsService.applyBalanceDelta(client, account.id, -totalSpent)
    }
    await logInvestmentTransaction(client, {
      userId, holdingId: holding.id, assetName: holding.asset_name, category: trimmedCategory, type: 'buy',
      quantity: numericQuantity, pricePerUnit: numericCostBasis, totalAmount: totalSpent, currency: currency.toUpperCase(),
      accountId: account?.id
    })
    return holding
  })
  await takeSnapshot(userId)
  return created
}

const getHoldingById = async (userId, id) => {
  const result = await query(SQL.getById, [id])
  return assertOwned(result.rows[0], userId, 'Investment holding not found')
}

const updatePrice = async (userId, id, currentPrice) => {
  const numericPrice = Number(currentPrice)
  if (!(numericPrice >= 0)) throw badRequest('currentPrice must be a non-negative number')
  assertValidPrice(numericPrice, 'currentPrice')
  const holding = await getHoldingById(userId, id)
  const result = await query(SQL.updatePrice, [numericPrice, holding.id])
  // Refreshes today's snapshot immediately so the trend charts reflect this
  // price change right away, instead of only catching up on the next
  // server restart or the 01:15 cron (design.md — same reasoning as the
  // startup catch-up, but triggered by the edit that actually changed
  // today's numbers rather than waiting for a schedule).
  await takeSnapshot(userId)
  return result.rows[0]
}

// Converts each holding's value and cost basis from its own currency into
// the user's display currency before totaling, mirroring how `accounts`
// handles multi-currency balances (design.md Decision 1). A holding whose
// currency has no cached rate is flagged rather than mis-totaled.
const getPortfolio = async (userId) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const result = await query(SQL.listOpenForUser, [userId])

  let totalValue = 0
  let totalCostBasis = 0
  let hasUnconverted = false

  const holdings = []
  for (const holding of result.rows) {
    const rawValue = Number(holding.quantity) * Number(holding.current_price)
    const rawCostBasis = Number(holding.cost_basis_total)

    const [convertedValue, convertedCostBasis] = await Promise.all([
      currencyService.convertAmount(rawValue, holding.currency, displayCurrency),
      currencyService.convertAmount(rawCostBasis, holding.currency, displayCurrency)
    ])

    if (!convertedValue.available || !convertedCostBasis.available) {
      hasUnconverted = true
      holdings.push({ ...holding, currentValue: null, unrealizedGain: null, returnPercentage: null, converted: false })
      continue
    }

    const value = convertedValue.amount
    const costBasis = convertedCostBasis.amount
    const gain = value - costBasis
    totalValue += value
    totalCostBasis += costBasis
    holdings.push({
      ...holding,
      currentValue: Math.round(value * 100) / 100,
      unrealizedGain: Math.round(gain * 100) / 100,
      returnPercentage: costBasis > 0 ? Math.round((gain / costBasis) * 1000) / 10 : null,
      converted: true
    })
  }

  return {
    displayCurrency,
    holdings,
    totalValue: Math.round(totalValue * 100) / 100,
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    totalUnrealizedGain: Math.round((totalValue - totalCostBasis) * 100) / 100,
    hasUnconverted
  }
}

const renameHolding = async (userId, id, assetName) => {
  if (typeof assetName !== 'string' || assetName.trim() === '') throw badRequest('assetName is required')
  const holding = await getHoldingById(userId, id)
  const result = await query(SQL.rename, [assetName.trim(), holding.id])
  return result.rows[0]
}

const setCategory = async (userId, id, category) => {
  const holding = await getHoldingById(userId, id)
  const trimmedCategory = typeof category === 'string' && category.trim() !== '' ? category.trim() : null
  const result = await query(SQL.setCategory, [trimmedCategory, holding.id])
  return result.rows[0]
}

// Needed to compute a portfolio CAGR (see getPortfolioCagr) that reflects
// when the asset was actually acquired, not when it was entered into the
// app — those two dates commonly differ since holdings were often backfilled
// well after the real purchase.
const setPurchasedAt = async (userId, id, purchasedAt) => {
  const holding = await getHoldingById(userId, id)
  if (purchasedAt && Number.isNaN(new Date(purchasedAt).getTime())) {
    throw badRequest('purchasedAt must be a valid date')
  }
  const result = await query(SQL.setPurchasedAt, [purchasedAt || null, holding.id])
  return result.rows[0]
}

// Blends a new purchase into an existing holding (quantity and cost basis
// added on top of what's already there) rather than creating a separate
// row per purchase — the simpler alternative to lot-tracking (design.md
// Decision 5): one row per asset stays easy to keep in sync (one price to
// update, one row to look at), at the cost of `purchased_at` staying at
// whenever the position was first opened rather than reflecting each
// contribution's own date — so the portfolio CAGR treats later top-ups as if
// invested since the original date, understating how new they actually are.
// accountId is optional, same deal as addHolding — deducts this top-up's
// spend from a linked account (must match the holding's currency) in the
// same transaction as the quantity/cost-basis update.
const addToHolding = async (userId, id, { quantity, costBasis, accountId }) => {
  const numericQuantity = Number(quantity)
  if (!(numericQuantity > 0)) throw badRequest('quantity must be a positive number')
  if (costBasis !== undefined && costBasis !== null && costBasis !== '' && Number(costBasis) < 0) {
    throw badRequest('costBasis cannot be negative')
  }
  const numericCostBasis = Number(costBasis) || 0
  const holding = await getHoldingById(userId, id)

  const newQuantity = Number(holding.quantity) + numericQuantity
  const totalSpent = numericQuantity * numericCostBasis
  const newCostBasisTotal = Number(holding.cost_basis_total) + totalSpent

  let account = null
  if (accountId !== undefined && accountId !== null && accountId !== '') {
    account = await accountsService.getAccountById(userId, accountId)
    if (account.currency !== holding.currency) {
      throw badRequest(`Linked account is in ${account.currency}, but this holding is in ${holding.currency} — link an account with the same currency, or leave the account unlinked`)
    }
  }

  const updated = await withTransaction(async (client) => {
    const result = await client.query(SQL.addToHolding, [newQuantity, newCostBasisTotal, holding.id])
    if (account) {
      await accountsService.applyBalanceDelta(client, account.id, -totalSpent)
    }
    await logInvestmentTransaction(client, {
      userId, holdingId: holding.id, assetName: holding.asset_name, category: holding.category, type: 'buy',
      quantity: numericQuantity, pricePerUnit: numericCostBasis, totalAmount: totalSpent, currency: holding.currency,
      accountId: account?.id
    })
    return result.rows[0]
  })
  await takeSnapshot(userId)
  return updated
}

const removeHolding = async (userId, id, quantity) => {
  const numericQuantity = Number(quantity)
  if (!(numericQuantity > 0)) throw badRequest('quantity must be a positive number')
  const holding = await getHoldingById(userId, id)
  if (numericQuantity > Number(holding.quantity)) {
    throw badRequest('Cannot remove more than the quantity currently held')
  }

  const remaining = Number(holding.quantity) - numericQuantity
  const costBasisPerUnit = Number(holding.cost_basis_total) / Number(holding.quantity)
  // Assumes current_price is what this quantity was actually sold at —
  // there's no separate "sold at" input, so update the price first if it
  // needs to reflect the real sale price before removing.
  const salePricePerUnit = Number(holding.current_price)
  const saleProceeds = numericQuantity * salePricePerUnit
  const realizedGain = (salePricePerUnit - costBasisPerUnit) * numericQuantity

  const updated = await withTransaction(async (client) => {
    const result = await client.query(SQL.removeQuantity, [remaining, remaining * costBasisPerUnit, remaining === 0, holding.id])
    await logInvestmentTransaction(client, {
      userId, holdingId: holding.id, assetName: holding.asset_name, category: holding.category, type: 'sell',
      quantity: numericQuantity, pricePerUnit: salePricePerUnit, totalAmount: saleProceeds, currency: holding.currency,
      realizedGain: Math.round(realizedGain * 100) / 100
    })
    return result.rows[0]
  })
  await takeSnapshot(userId)
  return updated
}

// A simple, transparent estimate (not a rigorous money-weighted return) of
// the investment portfolio's annualized growth rate, deliberately computed
// from cost basis vs. current value rather than net worth — net worth
// includes bank/cash balances that grow from income/savings, which would
// otherwise be misread as investment "growth" and inflate the figure.
//
// Holdings bought at different times are collapsed into one portfolio-level
// CAGR using a cost-basis-weighted average purchase date as a single
// "effective" start date, then CAGR = (totalValue / totalCostBasis) ^
// (1 / yearsElapsed) - 1. Holdings with no purchase date set are excluded
// (there's no way to know their holding period) and reported as such rather
// than silently skewing the result.
const getPortfolioCagr = async (userId) => {
  const portfolio = await getPortfolio(userId)
  const dated = portfolio.holdings.filter((h) => h.currentValue !== null && h.purchased_at)
  const excludedCount = portfolio.holdings.filter((h) => h.currentValue !== null && !h.purchased_at).length

  if (dated.length === 0) {
    return { available: false, reason: 'No holdings have a purchase date set', displayCurrency: portfolio.displayCurrency, excludedCount }
  }

  let totalCostBasis = 0
  let totalCurrentValue = 0
  let weightedTimestamp = 0
  for (const h of dated) {
    const costBasis = h.currentValue - h.unrealizedGain
    totalCostBasis += costBasis
    totalCurrentValue += h.currentValue
    weightedTimestamp += costBasis * new Date(h.purchased_at).getTime()
  }

  if (!(totalCostBasis > 0)) {
    return { available: false, reason: 'Total cost basis of dated holdings is zero', displayCurrency: portfolio.displayCurrency, excludedCount }
  }

  const avgPurchaseDate = new Date(weightedTimestamp / totalCostBasis)
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000
  const yearsElapsed = Math.max((Date.now() - avgPurchaseDate.getTime()) / msPerYear, 1 / 365)
  const cagr = Math.pow(totalCurrentValue / totalCostBasis, 1 / yearsElapsed) - 1

  return {
    available: true,
    cagr: Math.round(cagr * 1000) / 10,
    displayCurrency: portfolio.displayCurrency,
    includedCostBasis: Math.round(totalCostBasis * 100) / 100,
    includedCurrentValue: Math.round(totalCurrentValue * 100) / 100,
    effectiveStartDate: avgPurchaseDate.toISOString().slice(0, 10),
    yearsElapsed: Math.round(yearsElapsed * 100) / 100,
    excludedCount
  }
}

const setAllocationTargets = async (userId, targets, targetCagr) => {
  if (!Array.isArray(targets) || targets.length === 0) throw badRequest('targets must be a non-empty array')
  for (const t of targets) {
    if (typeof t.assetName !== 'string' || t.assetName.trim() === '') throw badRequest('Each target requires an assetName')
    if (!(Number(t.targetPercentage) >= 0)) throw badRequest('Each target requires a non-negative targetPercentage')
  }
  if (targetCagr !== undefined && targetCagr !== null && Number.isNaN(Number(targetCagr))) {
    throw badRequest('targetCagr must be a number')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(SQL.deleteAllocationTargets, [userId])
    for (const t of targets) {
      await client.query(SQL.insertAllocationTarget, [userId, t.assetName.trim(), Number(t.targetPercentage)])
    }
    if (targetCagr !== undefined) {
      await client.query(SQL.setTargetCagr, [targetCagr === null ? null : Number(targetCagr), userId])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return getAllocationComparison(userId)
}

// Compares each target's percentage against the actual current share of
// value held by whatever is assigned to it — an investment holding (matched
// by its `category` when set, falling back to its asset name) or an account
// (matched by its account type, e.g. "Bank" matches every `bank` account).
// This lets several holdings (e.g. "BBCA" and "BBRI") share one target
// bucket (e.g. "Equity Indonesia"), and also lets a target like "Bank"
// (typically at a 0% target, since the point is to see cash sitting outside
// investments) cover every bank account without naming each one.
// Matching is case-insensitive and ignores leading/trailing whitespace (but
// not spaces between words, which are part of the name — e.g. "RDPU Bibit")
// so accidental stray spaces from typing don't silently break a match.
const normalizeAssetName = (name) => name.trim().toUpperCase()

const getAllocationComparison = async (userId) => {
  const targetsResult = await query(SQL.listAllocationTargets, [userId])
  const portfolio = await getPortfolio(userId)

  const valueByAssetName = new Map()
  for (const holding of portfolio.holdings) {
    if (holding.currentValue === null) continue
    const key = normalizeAssetName(holding.category || holding.asset_name)
    valueByAssetName.set(key, (valueByAssetName.get(key) || 0) + holding.currentValue)
  }

  const accounts = await accountsService.listAccounts(userId)
  for (const account of accounts) {
    const { amount, available } = await currencyService.convertAmount(Number(account.balance), account.currency, portfolio.displayCurrency)
    if (!available) continue
    const key = normalizeAssetName(account.type)
    valueByAssetName.set(key, (valueByAssetName.get(key) || 0) + amount)
  }

  // Percentages are computed against total net worth (accounts + investments),
  // the same denominator the dashboard/reports Asset Allocation chart uses —
  // so a category's actual percentage here always matches its percentage
  // there. A target with no matching holding or account simply reports 0%,
  // and an unmatched holding/account still counts in net worth (matching
  // Asset Allocation's own treatment of an "uncategorized" position).
  const { netWorth } = await accountsService.getNetWorth(userId)

  const comparison = targetsResult.rows.map((t) => {
    const actualValue = valueByAssetName.get(normalizeAssetName(t.asset_name)) || 0
    const actualPercentage = netWorth !== 0 ? Math.round((actualValue / netWorth) * 1000) / 10 : 0
    return {
      assetName: t.asset_name,
      targetPercentage: Number(t.target_percentage),
      actualPercentage,
      actualValue: Math.round(actualValue * 100) / 100
    }
  })

  const userResult = await query(SQL.getTargetCagr, [userId])
  const targetCagr = userResult.rows[0]?.target_cagr !== null && userResult.rows[0]?.target_cagr !== undefined
    ? Number(userResult.rows[0].target_cagr)
    : null

  const actualCagr = await getPortfolioCagr(userId)

  return {
    displayCurrency: portfolio.displayCurrency,
    totalValue: portfolio.totalValue,
    netWorth,
    comparison,
    targetCagr,
    actualCagr
  }
}

// Scheduled once daily, same idea as reports' net worth snapshot — daily
// granularity is enough for a trend chart. Uses ON CONFLICT so calling this
// again the same day (e.g. the startup catch-up below) updates today's row
// instead of erroring or duplicating it.
const takeSnapshot = async (userId) => {
  const portfolio = await getPortfolio(userId)
  await query(SQL.insertOrUpdateSnapshot, [userId, portfolio.totalValue, portfolio.totalCostBasis, portfolio.displayCurrency])

  // Per-holding snapshot alongside the portfolio-total one above, so the
  // "all holdings" trend chart has a value to plot for each individual
  // asset, not just the combined total. A holding with an unconverted
  // currency (currentValue === null) is skipped rather than snapshotted
  // with a wrong/zero value.
  for (const holding of portfolio.holdings) {
    if (holding.currentValue === null) continue
    const costBasis = Math.round((holding.currentValue - holding.unrealizedGain) * 100) / 100
    await query(SQL.insertOrUpdateHoldingSnapshot, [userId, holding.id, holding.asset_name, holding.currentValue, costBasis, portfolio.displayCurrency])
  }
}

const takeAllUsersSnapshots = async () => {
  const users = await query(SQL.listAllUserIds)
  for (const user of users.rows) {
    try {
      await takeSnapshot(user.id)
    } catch (err) {
      console.error(`Failed to snapshot investments for user ${user.id}:`, err.message)
    }
  }
}

// Runs on every server startup, not just when today has no snapshot yet —
// takeSnapshot is idempotent (ON CONFLICT DO UPDATE), so re-running it just
// refreshes today's numbers to whatever the portfolio looks like right now.
// This also means a holding added later the same day (after an earlier
// restart already took today's snapshot) gets captured on the next restart
// instead of waiting until tomorrow. Still needed instead of relying solely
// on the fixed 01:15 cron, since a server that's only up during active use
// (not left running overnight) would rarely ever actually hit that time.
const catchUpAllUsersSnapshots = async () => {
  const users = await query(SQL.listAllUserIds)
  for (const user of users.rows) {
    try {
      await takeSnapshot(user.id)
    } catch (err) {
      console.error(`Failed to catch up investment snapshot for user ${user.id}:`, err.message)
    }
  }
}

// Snapshots before this date were backfilled from a spreadsheet that only
// ever recorded total portfolio VALUE per month, never cost basis — those
// rows had today's cost basis stamped on them as a placeholder just so the
// backfill had something to store (see design.md / chat history), which
// would misrepresent unrealized gain if charted. totalCostBasis (and the
// gain it implies) is hidden for snapshots before this date; totalValue,
// which the spreadsheet genuinely recorded, is unaffected.
const RELIABLE_COST_BASIS_START_DATE = '2026-09-15'

// display_currency is tagged per row the same way net worth snapshots are,
// and for the same reason: if the user's display currency ever changes, raw
// historical values would otherwise mix units the moment they're compared
// or charted together. Every point is converted into the CURRENT display
// currency here so the whole series stays in one consistent unit.
const getHistory = async (userId) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const result = await query(SQL.getHistory, [userId])

  const history = []
  for (const row of result.rows) {
    const costBasisIsReliable = row.snapshot_date >= RELIABLE_COST_BASIS_START_DATE
    const [convertedValue, convertedCostBasis] = await Promise.all([
      currencyService.convertAmount(Number(row.total_value), row.display_currency, displayCurrency),
      costBasisIsReliable
        ? currencyService.convertAmount(Number(row.total_cost_basis), row.display_currency, displayCurrency)
        : Promise.resolve({ available: false, amount: null })
    ])
    history.push({
      date: row.snapshot_date,
      totalValue: convertedValue.available ? convertedValue.amount : Number(row.total_value),
      totalCostBasis: costBasisIsReliable ? (convertedCostBasis.available ? convertedCostBasis.amount : Number(row.total_cost_basis)) : null,
      displayCurrency: convertedValue.available ? displayCurrency : row.display_currency
    })
  }
  return history
}

// Returns Recharts-ready "wide" data (one row per date, one column per
// holding) plus a series list mapping each column key to a display name.
// Keyed by holding_id (as `h<id>`) rather than asset_name, so two holdings
// that happen to share a name can never collide/merge into one line; the
// MOST RECENT name per id is used as the label so a later rename doesn't
// produce two different legend entries for what's really the same
// holding's history.
const getHoldingsHistory = async (userId) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const result = await query(SQL.getHoldingsHistory, [userId])

  const latestNameByHoldingId = new Map()
  for (const row of result.rows) {
    latestNameByHoldingId.set(row.holding_id, row.asset_name)
  }

  const byDate = new Map()
  for (const row of result.rows) {
    const converted = await currencyService.convertAmount(Number(row.value), row.display_currency, displayCurrency)
    const value = converted.available ? converted.amount : Number(row.value)
    const key = `h${row.holding_id}`

    if (!byDate.has(row.snapshot_date)) byDate.set(row.snapshot_date, { date: row.snapshot_date })
    byDate.get(row.snapshot_date)[key] = Math.round(value * 100) / 100
  }

  // Ordered by category (same grouping as the Holdings table, e.g. all
  // Crypto together, then all Equity Indonesia, etc.) so the legend reads
  // as grouped instead of in whatever order holdings happened to first get
  // a snapshot. A holding since deleted (no longer in investment_holdings)
  // just falls back to no category rather than breaking the lookup.
  const categoryResult = await query(SQL.listCategoriesByHolding, [userId])
  const categoryByHoldingId = new Map(categoryResult.rows.map((row) => [row.id, row.category]))
  const closedByHoldingId = new Map(categoryResult.rows.map((row) => [row.id, row.is_closed]))

  const series = Array.from(latestNameByHoldingId.entries())
    // Closed (fully sold/removed down to zero) holdings keep their past
    // snapshots in the DB, but the chart should match what "Holdings" below
    // it shows — only what you currently hold — rather than accumulating
    // every holding you've ever fully closed out into the legend forever.
    .filter(([holdingId]) => closedByHoldingId.get(holdingId) !== true)
    .map(([holdingId, name]) => ({ key: `h${holdingId}`, name, category: categoryByHoldingId.get(holdingId) || null }))
    .sort((a, b) => {
      if (a.category !== b.category) {
        if (a.category === null) return 1
        if (b.category === null) return -1
        return a.category.localeCompare(b.category)
      }
      return a.name.localeCompare(b.name)
    })
    // The category shown in parentheses here is always derived from the
    // holding's current category field — never hand-typed into the name
    // itself, so renaming a category updates every line/legend label that
    // uses it instead of requiring the asset to be individually renamed.
    .map(({ key, name, category }) => ({ key, name: category ? `${name} (${category})` : name }))

  return { displayCurrency, series, data: Array.from(byDate.values()) }
}

const listTransactions = async (userId) => {
  const result = await query(SQL.listTransactions, [userId])
  return result.rows
}

module.exports = {
  addHolding,
  getHoldingById,
  updatePrice,
  renameHolding,
  setCategory,
  setPurchasedAt,
  getPortfolio,
  getPortfolioCagr,
  addToHolding,
  removeHolding,
  setAllocationTargets,
  getAllocationComparison,
  takeSnapshot,
  takeAllUsersSnapshots,
  catchUpAllUsersSnapshots,
  getHistory,
  getHoldingsHistory,
  listTransactions
}
