'use strict'
const { query, pool, withTransaction } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, assertOwned } = require('../shared/utils')
const { isValidCurrencyCode } = require('../shared/currencyCodes')
const { resolveEntryTime } = require('../shared/entryDate')
const { shiftNetWorthHistory, shiftInvestmentHistory } = require('./netWorthHistory')

// A backdated buy/sell also corrects the saved daily history (net worth and
// portfolio charts) from its date: units valued at the trade price, plus the
// cash that left a linked account. Nothing to do for a trade made today.
const correctHistoryForTrade = async (userId, { tradeTime, holding, valueDelta, costDelta, cashDelta }) => {
  if (!tradeTime) return
  const changes = [{ occurredAt: tradeTime, amount: valueDelta, currency: holding.currency }]
  if (cashDelta) changes.push({ occurredAt: tradeTime, amount: cashDelta, currency: holding.currency })
  await shiftNetWorthHistory(userId, changes)
  await shiftInvestmentHistory(userId, {
    holdingId: holding.id, assetName: holding.asset_name, occurredAt: tradeTime, valueDelta, costDelta, currency: holding.currency
  })
}
const currencyService = require('./currency')
const accountsService = require('./accounts')
const periods = require('../shared/periods')

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
  listHoldingNames: loadSql('investments/listHoldingNames'),
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
  listHoldingSnapshotsAsOf: loadSql('investments/listHoldingSnapshotsAsOf'),
  listTradesAsOf: loadSql('investments/listTradesAsOf'),
  getHistoryStartDate: loadSql('investments/getHistoryStartDate'),
  insertOrUpdateSnapshot: loadSql('investments/insertOrUpdateSnapshot'),
  getHistory: loadSql('investments/getHistory'),
  getHoldingHistory: loadSql('investments/getHoldingHistory'),
  listTradesForCost: loadSql('investments/listTradesForCost'),
  listHoldingsForCost: loadSql('investments/listHoldingsForCost'),
  listAllUserIds: loadSql('investments/listAllUserIds'),
  insertOrUpdateHoldingSnapshot: loadSql('investments/insertOrUpdateHoldingSnapshot'),
  getHoldingsHistory: loadSql('investments/getHoldingsHistory'),
  listCategoriesByHolding: loadSql('investments/listCategoriesByHolding'),
  logTransaction: loadSql('investments/logTransaction'),
  listTransactions: loadSql('investments/listTransactions'),
  listTransactionsForHolding: loadSql('investments/listTransactionsForHolding')
}

// Records one row in the investment_transactions "mutasi" log — called
// inside the same withTransaction block as the holding/balance change it
// documents, so a buy or sell can never exist without its log entry (or
// vice versa). realizedGain is only meaningful for a 'sell'.
const logInvestmentTransaction = (client, { userId, holdingId, assetName, category, type, quantity, pricePerUnit, totalAmount, currency, realizedGain, accountId, occurredAt, fee }) => (
  client.query(SQL.logTransaction, [
    userId, holdingId, assetName, category || null, type, quantity, pricePerUnit, totalAmount, currency, realizedGain ?? null, accountId || null, occurredAt || null, fee ?? null
  ])
)

const roundCents = (value) => Math.round(value * 100) / 100

// The fee on a purchase is whatever was paid on top of quantity × market
// price — only knowable when both the total paid and the market price were
// given. null means "unknown" (stored as such, counted as 0 in totals).
const feeFromPurchase = (totalSpent, quantity, price) => (
  price === null ? null : Math.max(0, roundCents(totalSpent - quantity * price))
)

// A buy/sell can be logged for the day it actually happened (see shared/entryDate).
const resolveTradeTime = (date) => resolveEntryTime(date)

// accountId is optional — when given, the purchase (quantity × costBasis,
// which the caller should already have folded any brokerage/exchange fee
// into) is deducted from that account's balance in the same transaction as
// the holding is created, so the two can never drift apart the way a
// manually-remembered separate expense entry can (design.md — same
// reasoning as bills' optional linked account). Deliberately requires the
// account's currency to match the holding's currency rather than silently
// auto-converting: the deducted amount must be the exact real amount that
// left that account, not a rate-dependent estimate.
// The purchase can be given as totalSpent — everything actually paid, fees
// included, the same way adding to an existing holding works — or as a
// per-unit costBasis. With totalSpent, the per-unit cost is derived from it,
// so the amount deducted from a linked account is exactly what left it.
// An optional price (the market price per unit, without fees) becomes the
// holding's current price; otherwise it starts at the per-unit cost.
const addHolding = async (userId, { assetName, assetType, quantity, currency, costBasis, totalSpent: totalSpentInput, price, category, purchasedAt, accountId }) => {
  const tradeTime = resolveTradeTime(purchasedAt)
  if (typeof assetName !== 'string' || assetName.trim() === '') throw badRequest('assetName is required')
  if (typeof assetType !== 'string' || assetType.trim() === '') throw badRequest('assetType is required')
  const numericQuantity = Number(quantity)
  if (!(numericQuantity > 0)) throw badRequest('quantity must be a positive number')
  if (!isValidCurrencyCode(currency)) throw badRequest('A valid ISO 4217 currency code is required')
  const hasTotal = totalSpentInput !== undefined && totalSpentInput !== null && totalSpentInput !== ''
  if (hasTotal && !(Number(totalSpentInput) >= 0)) throw badRequest('totalSpent cannot be negative')
  if (!hasTotal && costBasis !== undefined && costBasis !== null && costBasis !== '' && Number(costBasis) < 0) {
    throw badRequest('costBasis cannot be negative')
  }
  const totalSpent = hasTotal ? Math.round(Number(totalSpentInput) * 100) / 100 : numericQuantity * (Number(costBasis) || 0)
  const numericCostBasis = hasTotal ? totalSpent / numericQuantity : (Number(costBasis) || 0)
  assertValidPrice(numericCostBasis, 'costBasis')
  const hasPrice = price !== undefined && price !== null && price !== ''
  if (hasPrice && !(Number(price) >= 0)) throw badRequest('price cannot be negative')
  const currentPrice = hasPrice ? Number(price) : numericCostBasis
  assertValidPrice(currentPrice, 'price')
  const fee = hasTotal && hasPrice ? feeFromPurchase(totalSpent, numericQuantity, Number(price)) : null
  const trimmedCategory = typeof category === 'string' && category.trim() !== '' ? category.trim() : null

  const insertParams = [userId, assetName.trim(), assetType.trim(), numericQuantity, currency.toUpperCase(), totalSpent, currentPrice, trimmedCategory, purchasedAt || null, fee ?? 0]

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
      quantity: numericQuantity, pricePerUnit: hasPrice ? Number(price) : numericCostBasis, totalAmount: totalSpent, currency: currency.toUpperCase(),
      accountId: account?.id, occurredAt: tradeTime, fee
    })
    return holding
  })
  await correctHistoryForTrade(userId, {
    tradeTime, holding: created, valueDelta: numericQuantity * currentPrice, costDelta: totalSpent, cashDelta: account ? -totalSpent : 0
  })
  await takeSnapshot(userId)
  return created
}

const getHoldingById = async (userId, id) => {
  const result = await query(SQL.getById, [id])
  return assertOwned(result.rows[0], userId, 'Investment holding not found')
}

// Everything about one holding, in its own currency: cost basis with and
// without fees (the latter is what broker apps usually show), current value,
// unrealized P/L, and its buy/sell history.
const getHoldingDetail = async (userId, id) => {
  const holding = await getHoldingById(userId, id)
  const quantity = Number(holding.quantity)
  const costBasis = Number(holding.cost_basis_total)
  const feesTotal = Number(holding.fees_total)
  const currentPrice = Number(holding.current_price)
  const value = roundCents(quantity * currentPrice)
  const costBasisExcludingFees = roundCents(costBasis - feesTotal)
  const perUnit = (total) => (quantity > 0 ? total / quantity : null)

  const transactions = (await query(SQL.listTransactionsForHolding, [userId, holding.id])).rows.map((t) => ({
    id: t.id,
    type: t.type,
    occurredAt: t.occurred_at,
    quantity: Number(t.quantity),
    pricePerUnit: Number(t.price_per_unit),
    fee: t.fee === null ? null : Number(t.fee),
    totalAmount: Number(t.total_amount),
    realizedGain: t.realized_gain === null ? null : Number(t.realized_gain)
  }))

  return {
    id: holding.id,
    assetName: holding.asset_name,
    assetType: holding.asset_type,
    category: holding.category,
    currency: holding.currency,
    purchasedAt: holding.purchased_at,
    isClosed: holding.is_closed,
    priceSource: holding.price_source || null,
    priceSymbol: holding.price_symbol || null,
    priceUpdatedAt: holding.price_updated_at || null,
    priceError: holding.price_error || null,
    quantity,
    currentPrice,
    value,
    costBasis,
    costBasisExcludingFees,
    feesTotal,
    averagePrice: perUnit(costBasis),
    averagePriceExcludingFees: perUnit(costBasisExcludingFees),
    unrealizedGain: roundCents(value - costBasis),
    unrealizedGainExcludingFees: roundCents(value - costBasisExcludingFees),
    returnPercentage: costBasis > 0 ? Math.round(((value - costBasis) / costBasis) * 1000) / 10 : null,
    returnPercentageExcludingFees: returnExcludingFees(holding),
    transactions
  }
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
// Return measured against the cost basis without fees, the way broker apps
// show it. A ratio, so it can be worked out in the holding's own currency.
const returnExcludingFees = (holding) => {
  const costExcludingFees = Number(holding.cost_basis_total) - Number(holding.fees_total || 0)
  if (!(costExcludingFees > 0)) return null
  const value = Number(holding.quantity) * Number(holding.current_price)
  return Math.round(((value - costExcludingFees) / costExcludingFees) * 1000) / 10
}

const getPortfolio = async (userId) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const result = await query(SQL.listOpenForUser, [userId])

  let totalValue = 0
  let totalCostBasis = 0
  let totalCostBasisExcludingFees = 0
  let hasUnconverted = false

  const holdings = []
  for (const holding of result.rows) {
    const rawValue = Number(holding.quantity) * Number(holding.current_price)
    const rawCostBasis = Number(holding.cost_basis_total)
    const rawCostExcludingFees = rawCostBasis - Number(holding.fees_total || 0)

    const [convertedValue, convertedCostBasis, convertedCostExcludingFees] = await Promise.all([
      currencyService.convertAmount(rawValue, holding.currency, displayCurrency),
      currencyService.convertAmount(rawCostBasis, holding.currency, displayCurrency),
      currencyService.convertAmount(rawCostExcludingFees, holding.currency, displayCurrency)
    ])

    if (!convertedValue.available || !convertedCostBasis.available || !convertedCostExcludingFees.available) {
      hasUnconverted = true
      holdings.push({ ...holding, currentValue: null, unrealizedGain: null, returnPercentage: null, returnPercentageExcludingFees: returnExcludingFees(holding), converted: false })
      continue
    }

    const value = convertedValue.amount
    const costBasis = convertedCostBasis.amount
    const gain = value - costBasis
    const costExcludingFees = convertedCostExcludingFees.amount
    totalValue += value
    totalCostBasis += costBasis
    totalCostBasisExcludingFees += costExcludingFees
    holdings.push({
      ...holding,
      currentValue: Math.round(value * 100) / 100,
      unrealizedGain: Math.round(gain * 100) / 100,
      unrealizedGainExcludingFees: Math.round((value - costExcludingFees) * 100) / 100,
      returnPercentage: costBasis > 0 ? Math.round((gain / costBasis) * 1000) / 10 : null,
      returnPercentageExcludingFees: returnExcludingFees(holding),
      converted: true
    })
  }

  return {
    displayCurrency,
    holdings,
    totalValue: Math.round(totalValue * 100) / 100,
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    totalUnrealizedGain: Math.round((totalValue - totalCostBasis) * 100) / 100,
    // The same two without broker fees, as broker apps show them.
    totalCostBasisExcludingFees: Math.round(totalCostBasisExcludingFees * 100) / 100,
    totalUnrealizedGainExcludingFees: Math.round((totalValue - totalCostBasisExcludingFees) * 100) / 100,
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
// same transaction as the quantity/cost-basis update. Like addHolding, the
// purchase can be given as totalSpent (fees included) or a per-unit
// costBasis. An optional market price works out this purchase's fee but does
// not touch the holding's last price — that is set once when the holding is
// created and changed only by an explicit price update, so recording an older
// purchase can't overwrite today's price with a stale one.
const addToHolding = async (userId, id, { quantity, costBasis, totalSpent: totalSpentInput, price, accountId, date }) => {
  const tradeTime = resolveTradeTime(date)
  const numericQuantity = Number(quantity)
  if (!(numericQuantity > 0)) throw badRequest('quantity must be a positive number')
  const hasTotal = totalSpentInput !== undefined && totalSpentInput !== null && totalSpentInput !== ''
  if (hasTotal && !(Number(totalSpentInput) >= 0)) throw badRequest('totalSpent cannot be negative')
  if (!hasTotal && costBasis !== undefined && costBasis !== null && costBasis !== '' && Number(costBasis) < 0) {
    throw badRequest('costBasis cannot be negative')
  }
  const totalSpent = hasTotal ? Math.round(Number(totalSpentInput) * 100) / 100 : numericQuantity * (Number(costBasis) || 0)
  const numericCostBasis = hasTotal ? totalSpent / numericQuantity : (Number(costBasis) || 0)
  const hasPrice = price !== undefined && price !== null && price !== ''
  if (hasPrice && !(Number(price) >= 0)) throw badRequest('price cannot be negative')
  if (hasPrice) assertValidPrice(Number(price), 'price')
  const holding = await getHoldingById(userId, id)

  const newQuantity = Number(holding.quantity) + numericQuantity
  const newCostBasisTotal = Number(holding.cost_basis_total) + totalSpent
  const fee = hasTotal && hasPrice ? feeFromPurchase(totalSpent, numericQuantity, Number(price)) : null
  const newFeesTotal = roundCents(Number(holding.fees_total) + (fee ?? 0))

  let account = null
  if (accountId !== undefined && accountId !== null && accountId !== '') {
    account = await accountsService.getAccountById(userId, accountId)
    if (account.currency !== holding.currency) {
      throw badRequest(`Linked account is in ${account.currency}, but this holding is in ${holding.currency} — link an account with the same currency, or leave the account unlinked`)
    }
  }

  const updated = await withTransaction(async (client) => {
    const result = await client.query(SQL.addToHolding, [newQuantity, newCostBasisTotal, newFeesTotal, holding.id])
    if (account) {
      await accountsService.applyBalanceDelta(client, account.id, -totalSpent)
    }
    await logInvestmentTransaction(client, {
      userId, holdingId: holding.id, assetName: holding.asset_name, category: holding.category, type: 'buy',
      quantity: numericQuantity, pricePerUnit: hasPrice ? Number(price) : numericCostBasis, totalAmount: totalSpent, currency: holding.currency,
      accountId: account?.id, occurredAt: tradeTime, fee
    })
    return result.rows[0]
  })
  await correctHistoryForTrade(userId, {
    tradeTime, holding, valueDelta: numericQuantity * (hasPrice ? Number(price) : numericCostBasis), costDelta: totalSpent, cashDelta: account ? -totalSpent : 0
  })
  await takeSnapshot(userId)
  return updated
}

// Sells part or all of a holding. The sale can be given as the price per
// unit and/or the total actually received (after the broker's fee and the
// sales tax); without a price, the holding's last price is assumed. With
// accountId, the money received is added to that account (same currency as
// the holding), so net worth doesn't drop by what was sold. The realized
// gain is what came in minus what those units cost, fees included.
// The older positional form removeHolding(userId, id, quantity, date) still
// works for scripts.
const removeHolding = async (userId, id, input, legacyDate) => {
  const { quantity, price, totalReceived, accountId, date } = (input !== null && typeof input === 'object')
    ? input
    : { quantity: input, date: legacyDate }
  const tradeTime = resolveTradeTime(date)
  const numericQuantity = Number(quantity)
  if (!(numericQuantity > 0)) throw badRequest('quantity must be a positive number')
  const hasPrice = price !== undefined && price !== null && price !== ''
  if (hasPrice && !(Number(price) > 0)) throw badRequest('price must be a positive number')
  if (hasPrice) assertValidPrice(Number(price), 'price')
  const hasTotal = totalReceived !== undefined && totalReceived !== null && totalReceived !== ''
  if (hasTotal && !(Number(totalReceived) >= 0)) throw badRequest('totalReceived cannot be negative')
  const holding = await getHoldingById(userId, id)
  if (numericQuantity > Number(holding.quantity) + 1e-8) {
    throw badRequest('Cannot sell more than the quantity currently held')
  }

  let account = null
  if (accountId !== undefined && accountId !== null && accountId !== '') {
    account = await accountsService.getAccountById(userId, accountId)
    if (account.currency !== holding.currency) {
      throw badRequest(`The receiving account is in ${account.currency}, but this holding is in ${holding.currency} — pick an account in ${holding.currency}`)
    }
  }

  const remaining = Math.max(0, Number(holding.quantity) - numericQuantity)
  const costBasisPerUnit = Number(holding.cost_basis_total) / Number(holding.quantity)
  const salePricePerUnit = hasPrice ? Number(price) : (hasTotal ? Number(totalReceived) / numericQuantity : Number(holding.current_price))
  const saleProceeds = roundCents(hasTotal ? Number(totalReceived) : numericQuantity * salePricePerUnit)
  // Fee and tax on the sale: the gap between quantity × price and what came in.
  const fee = hasPrice && hasTotal ? Math.max(0, roundCents(numericQuantity * salePricePerUnit - saleProceeds)) : null
  const realizedGain = saleProceeds - costBasisPerUnit * numericQuantity

  const updated = await withTransaction(async (client) => {
    const remainingFees = roundCents(Number(holding.fees_total) * (remaining / Number(holding.quantity)))
    const result = await client.query(SQL.removeQuantity, [remaining, remaining * costBasisPerUnit, remaining === 0, remainingFees, holding.id])
    if (account) {
      await accountsService.applyBalanceDelta(client, account.id, saleProceeds)
    }
    await logInvestmentTransaction(client, {
      userId, holdingId: holding.id, assetName: holding.asset_name, category: holding.category, type: 'sell',
      quantity: numericQuantity, pricePerUnit: salePricePerUnit, totalAmount: saleProceeds, currency: holding.currency,
      realizedGain: roundCents(realizedGain), accountId: account?.id, occurredAt: tradeTime, fee
    })
    return result.rows[0]
  })
  await correctHistoryForTrade(userId, {
    tradeTime,
    holding,
    valueDelta: -numericQuantity * (hasPrice ? salePricePerUnit : Number(holding.current_price)),
    costDelta: -numericQuantity * costBasisPerUnit,
    cashDelta: account ? saleProceeds : 0
  })
  await takeSnapshot(userId)
  return { ...updated, sale: { quantity: numericQuantity, proceeds: saleProceeds, fee, realizedGain: roundCents(realizedGain) } }
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

// The annual rate r at which every dated cash flow (negative = money put in,
// positive = money taken out or still held) discounts to zero — XIRR, as in
// a spreadsheet. Solved by bisection, which can't diverge the way Newton can
// when returns are extreme over a short period.
const solveXirr = (flows) => {
  const t0 = flows[0].time
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000
  const npv = (rate) => flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, (f.time - t0) / msPerYear), 0)
  let low = -0.9999
  let high = 10
  if (npv(low) * npv(high) > 0) return null
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2
    if (npv(low) * npv(mid) <= 0) high = mid
    else low = mid
  }
  return (low + high) / 2
}

// The portfolio's money-weighted annual return (XIRR): each recorded buy is
// money in on its own date, each sell money out, and today's value is what
// would come out now. Unlike getPortfolioCagr, a top-up only counts from the
// day it was made. Buys and sells are counted at quantity × price, without
// fees. Needs every holding's trades to account for all of it.
// Trades from before the saved rate history began are converted at today's
// rate.
const getPortfolioXirr = async (userId) => {
  const portfolio = await getPortfolio(userId)
  const displayCurrency = portfolio.displayCurrency
  const holdings = (await query(SQL.listHoldingsForCost, [userId])).rows
  const trades = (await query(SQL.listTradesForCost, [userId])).rows
  for (const holding of holdings) {
    let quantity = 0
    let count = 0
    for (const t of trades) {
      if (t.holding_id !== holding.id) continue
      quantity += t.type === 'buy' ? Number(t.quantity) : -Number(t.quantity)
      count += 1
    }
    if (count === 0 && holding.is_closed) continue
    const expected = holding.is_closed ? 0 : Number(holding.quantity)
    if (Math.abs(quantity - expected) > 1e-8) {
      return { available: false, reason: 'Some holdings are missing part of their buy/sell history' }
    }
  }
  if (trades.length === 0) return { available: false, reason: 'No recorded buys yet' }
  if (portfolio.holdings.some((h) => h.currentValue === null)) {
    return { available: false, reason: 'Some holdings have no value in the display currency' }
  }

  const currencyOf = new Map(holdings.map((h) => [h.id, h.currency]))
  const flows = []
  for (const t of trades) {
    const currency = currencyOf.get(t.holding_id)
    // Quantity × price, without broker fees or tax, like the P&L figures.
    const grossAmount = Number(t.quantity) * Number(t.price_per_unit)
    let converted = await currencyService.convertAmountAsOf(grossAmount, currency, displayCurrency, t.trade_date)
    if (!converted.available) converted = await currencyService.convertAmount(grossAmount, currency, displayCurrency)
    if (!converted.available) return { available: false, reason: `No exchange rate from ${currency}` }
    flows.push({ time: new Date(`${t.trade_date}T00:00:00Z`).getTime(), amount: t.type === 'buy' ? -converted.amount : converted.amount })
  }
  flows.push({ time: Date.now(), amount: portfolio.totalValue })

  const rate = solveXirr(flows)
  if (rate === null) return { available: false, reason: 'Return could not be worked out from these trades' }
  // Gain/loss on what the current holdings cost, fees not counted.
  const costBasis = portfolio.totalCostBasisExcludingFees
  return {
    available: true,
    xirr: Math.round(rate * 1000) / 10,
    gainLoss: costBasis > 0 ? Math.round((portfolio.totalValue / costBasis - 1) * 1000) / 10 : null,
    displayCurrency,
    firstTradeDate: trades[0].trade_date
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

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// What was held at the end of `asOf` ('YYYY-MM-DD'), grouped the same way as
// the current allocation: accounts by type, using each one's balance as of
// that day from its statement, and holdings by category (or asset name),
// using each one's last saved daily value by then. Foreign-currency account
// balances convert at today's rate, since past rates aren't kept.
const getAllocationValuesAsOf = async (userId, asOf, displayCurrency) => {
  const values = new Map()
  let hasUnconverted = false
  const add = (key, amount) => values.set(key, (values.get(key) || 0) + amount)

  for (const account of await accountsService.listAccounts(userId)) {
    const { closingBalance } = await accountsService.getStatement(userId, account.id, { endDate: asOf })
    const { amount, available } = await currencyService.convertAmount(closingBalance, account.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    add(account.type, amount)
  }

  const snapshots = await query(SQL.listHoldingSnapshotsAsOf, [userId, asOf])
  const snapshotDateByHolding = new Map()
  for (const row of snapshots.rows) {
    snapshotDateByHolding.set(row.holding_id, row.snapshot_date)
    const { amount, available } = await currencyService.convertAmount(Number(row.value), row.display_currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    add((row.category && row.category.trim()) || row.asset_name, amount)
  }

  // Snapshots are only saved on days the app ran, so a buy or sell between a
  // holding's last snapshot and asOf (or before its first one) isn't in it
  // yet, while the cash side already is in the account balance above. Those
  // trades are added at their own price, the same way backdated trades
  // correct the saved history.
  const trades = await query(SQL.listTradesAsOf, [userId, asOf])
  for (const trade of trades.rows) {
    const snapshotDate = snapshotDateByHolding.get(trade.holding_id)
    if (snapshotDate && trade.trade_date <= snapshotDate) continue
    const tradeValue = Number(trade.quantity) * Number(trade.price_per_unit) * (trade.type === 'sell' ? -1 : 1)
    const { amount, available } = await currencyService.convertAmount(tradeValue, trade.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    add((trade.category && trade.category.trim()) || trade.asset_name, amount)
  }

  return { values, hasUnconverted }
}

// What each holding was worth on a past day, in the display currency: its
// last saved value on or before then, plus any trade since that snapshot at
// the trade's own price (same rebuild as getAllocationValuesAsOf, per holding).
const getHoldingValuesAsOf = async (userId, asOf, displayCurrency) => {
  const values = new Map()
  let hasUnconverted = false
  const add = (id, amount) => values.set(id, (values.get(id) || 0) + amount)
  const snapshotDateByHolding = new Map()
  for (const row of (await query(SQL.listHoldingSnapshotsAsOf, [userId, asOf])).rows) {
    snapshotDateByHolding.set(row.holding_id, row.snapshot_date)
    const { amount, available } = await currencyService.convertAmount(Number(row.value), row.display_currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    add(row.holding_id, amount)
  }
  for (const trade of (await query(SQL.listTradesAsOf, [userId, asOf])).rows) {
    const snapshotDate = snapshotDateByHolding.get(trade.holding_id)
    if (snapshotDate && trade.trade_date <= snapshotDate) continue
    const tradeValue = Number(trade.quantity) * Number(trade.price_per_unit) * (trade.type === 'sell' ? -1 : 1)
    const { amount, available } = await currencyService.convertAmount(tradeValue, trade.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    add(trade.holding_id, amount)
  }
  return { values, hasUnconverted }
}

const daysBetween = (fromKey, toKey) => Math.round((new Date(`${toKey}T00:00:00`) - new Date(`${fromKey}T00:00:00`)) / 86400000)

// How the investments did over one budget cycle (periodOffset 0 = this one):
// the change in their value, minus the money put in or taken out meanwhile —
// so buying more never counts as a gain. pnl = end value − start value −
// (bought − sold), per holding and in total. Buys and sells are counted at
// quantity × price, without broker fees or tax. The percentage is a Modified
// Dietz return: pnl over the start value plus each flow weighted by how long
// it was invested during the cycle.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// With startDate/endDate ('YYYY-MM-DD', both days included) it measures that
// stretch instead of a cycle.
const getPeriodPerformance = async (userId, { periodOffset, startDate, endDate } = {}) => {
  const offset = Math.min(24, Math.max(0, Math.floor(Number(periodOffset)) || 0))
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const todayKey = toDateKey(new Date())
  const custom = Boolean(startDate || endDate)
  let start
  let end
  if (custom) {
    for (const [name, value] of [['startDate', startDate], ['endDate', endDate]]) {
      if (value && !DATE_ONLY.test(value)) throw badRequest(`${name} must be in YYYY-MM-DD format`)
    }
    start = new Date(`${startDate || endDate}T00:00:00`)
    end = new Date(`${endDate || todayKey}T00:00:00`)
    if (start > end) throw badRequest('startDate must not be after endDate')
  } else {
    ;({ start, end } = periods.getPeriodBoundsForOffset(cycleStartDay, offset))
  }
  // Measured from the close of the day before the first day, so a change on
  // the first day itself counts.
  const startKey = toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1))
  const endKey = toDateKey(end) < todayKey ? toDateKey(end) : todayKey

  const names = new Map((await query(SQL.listHoldingNames, [userId])).rows.map((h) => [h.id, h]))
  let hasUnconverted = false

  const startSide = await getHoldingValuesAsOf(userId, startKey, displayCurrency)
  hasUnconverted = hasUnconverted || startSide.hasUnconverted
  let endValues
  if (endKey === todayKey) {
    const portfolio = await getPortfolio(userId)
    hasUnconverted = hasUnconverted || portfolio.hasUnconverted
    endValues = new Map(portfolio.holdings.filter((h) => h.currentValue !== null).map((h) => [h.id, h.currentValue]))
  } else {
    const endSide = await getHoldingValuesAsOf(userId, endKey, displayCurrency)
    hasUnconverted = hasUnconverted || endSide.hasUnconverted
    endValues = endSide.values
  }

  const totalDays = Math.max(1, daysBetween(startKey, endKey))
  const rows = new Map()
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { id, name: names.get(id)?.asset_name || 'Unknown', startValue: startSide.values.get(id) || 0, endValue: endValues.get(id) || 0, bought: 0, sold: 0, weighted: 0 })
    return rows.get(id)
  }
  for (const id of new Set([...startSide.values.keys(), ...endValues.keys()])) row(id)

  let weightedFlows = 0
  for (const t of (await query(SQL.listTradesForCost, [userId])).rows) {
    if (t.trade_date <= startKey || t.trade_date > endKey) continue
    const currency = names.get(t.holding_id)?.currency
    if (!currency) continue
    // Quantity × price, not the total paid or received: broker fees and tax
    // are left out, so the result is the price movement alone.
    const grossAmount = Number(t.quantity) * Number(t.price_per_unit)
    let converted = await currencyService.convertAmountAsOf(grossAmount, currency, displayCurrency, t.trade_date)
    if (!converted.available) converted = await currencyService.convertAmount(grossAmount, currency, displayCurrency)
    if (!converted.available) { hasUnconverted = true; continue }
    const target = row(t.holding_id)
    const flow = t.type === 'buy' ? converted.amount : -converted.amount
    if (t.type === 'buy') target.bought += converted.amount
    else target.sold += converted.amount
    const weighted = flow * ((totalDays - daysBetween(startKey, t.trade_date)) / totalDays)
    target.weighted += weighted
    weightedFlows += weighted
  }

  // Each holding's own return over the cycle, worked out the same way as the
  // total one (see below).
  const dietz = (pnl, startValue, weighted, bought) => {
    let base = startValue + weighted
    if (!(base > 0)) base = startValue + bought
    return base > 0 ? Math.round((pnl / base) * 1000) / 10 : null
  }
  const holdings = [...rows.values()]
    .map((h) => ({ ...h, pnl: h.endValue - h.startValue - (h.bought - h.sold) }))
    .filter((h) => Math.abs(h.startValue) + Math.abs(h.endValue) + h.bought + h.sold > 0.005)
    .map(({ weighted, ...h }) => ({
      ...Object.fromEntries(Object.entries(h).map(([k, v]) => [k, typeof v === 'number' ? roundCents(v) : v])),
      percent: dietz(h.pnl, h.startValue, weighted, h.bought)
    }))
    .sort((a, b) => b.pnl - a.pnl)

  const sum = (key) => roundCents(holdings.reduce((total, h) => total + h[key], 0))
  const startValue = sum('startValue')
  const pnl = sum('pnl')
  // Money that went in on the very last day has weight 0, which can leave
  // nothing to divide by (everything bought today): fall back to the money
  // put in.
  let base = startValue + weightedFlows
  if (!(base > 0)) base = startValue + sum('bought')
  return {
    displayCurrency,
    periodOffset: offset,
    periodLabel: custom
      ? `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(`${endKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : periods.formatPeriodLabel(start, end, cycleStartDay),
    startDate: startKey,
    firstDay: toDateKey(start),
    endDate: endKey,
    isCurrent: custom ? endKey === todayKey : offset === 0,
    startValue,
    endValue: sum('endValue'),
    bought: sum('bought'),
    sold: sum('sold'),
    pnl,
    percent: base > 0 ? Math.round((pnl / base) * 1000) / 10 : null,
    holdings,
    hasUnconverted
  }
}

// Ends of past budget cycles, most recent first ({ offset: 1 } is the cycle
// before the current one), back to the first one the app has history for.
const listPastCycleEnds = async (userId, limit = 24) => {
  const startDate = (await query(SQL.getHistoryStartDate, [userId])).rows[0]?.start_date
  if (!startDate) return []
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const ends = []
  for (let offset = 1; offset <= limit; offset++) {
    const asOf = toDateKey(periods.getPeriodBoundsForOffset(cycleStartDay, offset).end)
    if (asOf < startDate) break
    ends.push({ offset, asOf })
  }
  return ends
}

// compareOffset picks which past cycle end the actual allocation is compared
// with (1 = end of the last cycle, the default).
const getAllocationComparison = async (userId, { compareOffset } = {}) => {
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

  const compareOptions = await listPastCycleEnds(userId)
  const compareWith = compareOptions.find((o) => o.offset === Number(compareOffset)) || compareOptions[0] || null
  let previousByAssetName = null
  let previousTotal = 0
  if (compareWith) {
    const { values } = await getAllocationValuesAsOf(userId, compareWith.asOf, portfolio.displayCurrency)
    previousByAssetName = new Map()
    for (const [key, amount] of values) {
      const name = normalizeAssetName(key)
      previousByAssetName.set(name, (previousByAssetName.get(name) || 0) + amount)
      previousTotal += amount
    }
  }

  const comparison = targetsResult.rows.map((t) => {
    const name = normalizeAssetName(t.asset_name)
    const actualValue = valueByAssetName.get(name) || 0
    const actualPercentage = netWorth !== 0 ? Math.round((actualValue / netWorth) * 1000) / 10 : 0
    const previousValue = previousByAssetName ? previousByAssetName.get(name) || 0 : null
    return {
      assetName: t.asset_name,
      targetPercentage: Number(t.target_percentage),
      actualPercentage,
      actualValue: Math.round(actualValue * 100) / 100,
      previousPercentage: previousValue === null ? null : (previousTotal !== 0 ? Math.round((previousValue / previousTotal) * 1000) / 10 : 0)
    }
  })

  const userResult = await query(SQL.getTargetCagr, [userId])
  const targetCagr = userResult.rows[0]?.target_cagr !== null && userResult.rows[0]?.target_cagr !== undefined
    ? Number(userResult.rows[0].target_cagr)
    : null

  const [actualCagr, actualXirr] = await Promise.all([getPortfolioCagr(userId), getPortfolioXirr(userId)])

  return {
    displayCurrency: portfolio.displayCurrency,
    totalValue: portfolio.totalValue,
    netWorth,
    comparison,
    compareWith,
    compareOptions,
    targetCagr,
    actualCagr,
    actualXirr
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

// Cost basis on any past date, rebuilt from the recorded buys and sells
// (average cost: a sale removes its share of the cost). Only possible when a
// holding's trades account for all of it — the units they add up to match
// what's held now (or zero for a closed holding). Returns a function from a
// 'YYYY-MM-DD' date to the cost in the display currency then, or null when
// any holding in scope isn't fully covered by its trades.
const tradeCostSeries = async (userId, displayCurrency, holdingId = null) => {
  const holdings = (await query(SQL.listHoldingsForCost, [userId])).rows
    .filter((h) => holdingId === null || h.id === holdingId)
  const trades = (await query(SQL.listTradesForCost, [userId])).rows
  const series = []
  for (const holding of holdings) {
    let quantity = 0
    let cost = 0
    const steps = []
    for (const t of trades) {
      if (t.holding_id !== holding.id) continue
      const q = Number(t.quantity)
      if (t.type === 'buy') {
        quantity += q
        cost += Number(t.total_amount)
      } else if (quantity > 0) {
        cost -= (cost / quantity) * q
        quantity -= q
      }
      steps.push({ date: t.trade_date, cost })
    }
    // A closed holding with no trades never had a known cost to chart.
    if (steps.length === 0 && holding.is_closed) continue
    const expected = holding.is_closed ? 0 : Number(holding.quantity)
    if (Math.abs(quantity - expected) > 1e-8) return null
    series.push({ currency: holding.currency, steps })
  }

  // Exchange rates per day, from the saved rate history where it reaches.
  const rates = new Map()
  const rateOn = async (currency, date) => {
    if (currency === displayCurrency) return 1
    const key = `${currency}:${date}`
    if (!rates.has(key)) {
      const then = await currencyService.convertAmountAsOf(1_000_000, currency, displayCurrency, date)
      const converted = then.available ? then : await currencyService.convertAmount(1_000_000, currency, displayCurrency)
      rates.set(key, converted.available ? converted.amount / 1_000_000 : null)
    }
    return rates.get(key)
  }

  return async (date) => {
    let total = 0
    for (const { currency, steps } of series) {
      let cost = 0
      for (const step of steps) {
        if (step.date > date) break
        cost = step.cost
      }
      if (cost === 0) continue
      const rate = await rateOn(currency, date)
      if (rate === null) return null
      total += cost * rate
    }
    // Before the first purchase there's no cost to draw, rather than a 0.
    return total === 0 ? null : Math.round(total * 100) / 100
  }
}

// display_currency is tagged per row the same way net worth snapshots are,
// and for the same reason: if the user's display currency ever changes, raw
// historical values would otherwise mix units the moment they're compared
// or charted together. Every point is converted into the CURRENT display
// currency here so the whole series stays in one consistent unit.
//
// With holdingId, the same series for that one holding (its value and cost
// basis from the per-holding daily snapshots) instead of the whole portfolio.
//
// When the recorded trades cover every holding in scope, the cost basis line
// is rebuilt from them for every date — so it reaches back to the first
// purchase, not just to when reliable cost snapshots began.
const getHistory = async (userId, { holdingId } = {}) => {
  const displayCurrency = await accountsService.getDisplayCurrency(userId)
  let result
  let costOn
  if (holdingId !== undefined && holdingId !== null && holdingId !== '') {
    if (!/^\d+$/.test(String(holdingId))) throw badRequest('holdingId must be a holding id')
    const holding = await getHoldingById(userId, Number(holdingId))
    result = await query(SQL.getHoldingHistory, [userId, holding.id])
    costOn = await tradeCostSeries(userId, displayCurrency, holding.id)
  } else {
    result = await query(SQL.getHistory, [userId])
    costOn = await tradeCostSeries(userId, displayCurrency)
  }

  const history = []
  for (const row of result.rows) {
    const costBasisIsReliable = row.snapshot_date >= RELIABLE_COST_BASIS_START_DATE
    const [convertedValue, convertedCostBasis] = await Promise.all([
      currencyService.convertAmount(Number(row.total_value), row.display_currency, displayCurrency),
      costBasisIsReliable
        ? currencyService.convertAmount(Number(row.total_cost_basis), row.display_currency, displayCurrency)
        : Promise.resolve({ available: false, amount: null })
    ])
    const snapshotCost = costBasisIsReliable ? (convertedCostBasis.available ? convertedCostBasis.amount : Number(row.total_cost_basis)) : null
    const rebuiltCost = costOn ? await costOn(row.snapshot_date) : null
    history.push({
      date: row.snapshot_date,
      totalValue: convertedValue.available ? convertedValue.amount : Number(row.total_value),
      totalCostBasis: rebuiltCost ?? snapshotCost,
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
  getHoldingDetail,
  updatePrice,
  renameHolding,
  setCategory,
  setPurchasedAt,
  getPortfolio,
  getPortfolioCagr,
  getPortfolioXirr,
  getPeriodPerformance,
  addToHolding,
  removeHolding,
  setAllocationTargets,
  getAllocationComparison,
  getAllocationValuesAsOf,
  takeSnapshot,
  takeAllUsersSnapshots,
  catchUpAllUsersSnapshots,
  getHistory,
  getHoldingsHistory,
  listTransactions
}
