'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest } = require('../shared/utils')
const marketData = require('./marketData')
const investmentsService = require('./investments')
const reportsService = require('./reports')
const currencyService = require('./currency')

const SQL = {
  setPriceSource: loadSql('investments/setPriceSource'),
  clearPriceSource: loadSql('investments/clearPriceSource'),
  setMarketPrice: loadSql('investments/setMarketPrice'),
  setPriceError: loadSql('investments/setPriceError'),
  listLinkedForUser: loadSql('investments/listLinkedForUser'),
  listOpenForUser: loadSql('investments/listOpenForUser'),
  listUsersWithLinkedHoldings: loadSql('investments/listUsersWithLinkedHoldings'),
  listTradesForCost: loadSql('investments/listTradesForCost'),
  getHoldingHistory: loadSql('investments/getHoldingHistory')
}

// Prices are only refreshed once they're older than this, on startup.
const STALE_AFTER_HOURS = 12

// A market price in the holding's own currency (converted when the listing
// trades in another one).
const priceInCurrency = async (quote, currency) => {
  if (quote.currency === currency) return quote.price
  const converted = await currencyService.convertAmount(quote.price, quote.currency, currency)
  if (!converted.available) throw new Error(`No exchange rate from ${quote.currency} to ${currency}`)
  return converted.amount
}

// Today's portfolio and net worth points, after any price change.
const refreshSnapshots = async (userId) => {
  await investmentsService.takeSnapshot(userId)
  await reportsService.takeNetWorthSnapshot(userId)
}

// Market listings for a search box, the ones in `currency` first.
const searchMarket = async (q, { currency } = {}) => {
  const results = await marketData.search(q)
  if (!currency) return results
  const code = String(currency).toUpperCase()
  return [...results.filter((r) => r.currency === code), ...results.filter((r) => r.currency !== code)]
}

// A listing is only pre-selected when its code is the holding's name (BBCA
// for BBCA.JK, BTC for btcidr); anything looser is offered, not chosen.
const baseCode = (candidate) => (candidate.source === 'indodax' ? candidate.symbol.replace(/idr$/, '') : candidate.symbol.split(/[.-]/)[0]).toUpperCase()

// For each manually priced holding, the market listings it most likely is —
// searched by its name, and only listings in the holding's own currency, so a
// short name like "BCA" can't be matched to an unrelated US company.
const suggestLinks = async (userId) => {
  const holdings = (await query(SQL.listOpenForUser, [userId])).rows.filter((h) => !h.price_source)
  const suggestions = []
  for (const holding of holdings) {
    let candidates = []
    try {
      candidates = (await marketData.search(holding.asset_name)).filter((c) => c.currency === holding.currency)
    } catch {
      candidates = []
    }
    suggestions.push({
      holdingId: holding.id,
      assetName: holding.asset_name,
      assetType: holding.asset_type,
      currency: holding.currency,
      candidates: candidates.slice(0, 4),
      recommended: candidates.findIndex((c) => baseCode(c) === holding.asset_name.trim().toUpperCase())
    })
  }
  return suggestions
}

// Ties a holding's price to a market listing and sets it from there right away.
const linkHolding = async (userId, holdingId, { source, symbol } = {}) => {
  if (!marketData.isKnownSource(source)) throw badRequest('Unknown price source')
  if (typeof symbol !== 'string' || symbol.trim() === '') throw badRequest('A market symbol is required')
  const holding = await investmentsService.getHoldingById(userId, holdingId)
  let price
  try {
    price = await priceInCurrency(await marketData.getQuote(source, symbol.trim()), holding.currency)
  } catch (err) {
    throw badRequest(`Couldn't get a price for ${symbol}: ${err.message}`)
  }
  const result = await query(SQL.setPriceSource, [source, symbol.trim(), Math.round(price * 1e8) / 1e8, holding.id])
  await refreshSnapshots(userId)
  return result.rows[0]
}

// Back to typing the price in by hand; the last price is kept.
const unlinkHolding = async (userId, holdingId) => {
  const holding = await investmentsService.getHoldingById(userId, holdingId)
  const result = await query(SQL.clearPriceSource, [holding.id])
  return result.rows[0]
}

// Refreshes every automatically priced holding of one user. A holding whose
// source fails keeps its last price and records why, to be flagged in the UI.
const refreshUserPrices = async (userId) => {
  const holdings = (await query(SQL.listLinkedForUser, [userId])).rows
  const failed = []
  let updated = 0
  for (const holding of holdings) {
    try {
      const price = await priceInCurrency(await marketData.getQuote(holding.price_source, holding.price_symbol), holding.currency)
      await query(SQL.setMarketPrice, [Math.round(price * 1e8) / 1e8, holding.id])
      updated += 1
    } catch (err) {
      await query(SQL.setPriceError, [err.message, holding.id])
      failed.push({ holdingId: holding.id, assetName: holding.asset_name, error: err.message })
    }
  }
  if (holdings.length > 0) await refreshSnapshots(userId)
  return { updated, failed, updatedAt: new Date() }
}

// For the scheduler: every user with automatic prices, or on startup only
// those whose prices have gone stale.
const refreshAllUsersPrices = async ({ onlyStale = false } = {}) => {
  const users = (await query(SQL.listUsersWithLinkedHoldings)).rows
  const staleBefore = Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000
  for (const user of users) {
    if (onlyStale && !user.never_updated && new Date(user.oldest_update).getTime() > staleBefore) continue
    try {
      await refreshUserPrices(user.user_id)
    } catch (err) {
      console.error(`Price update failed for user ${user.user_id}:`, err.message)
    }
  }
}

const dayKey = (d) => d.toISOString().slice(0, 10)

// A holding's price per unit day by day, in its own currency. Market-linked
// holdings use the source's daily closes (going back before the app saved
// anything, from a month before the first trade); others are worked out from
// the saved daily values and the units held each day.
const getPriceHistory = async (userId, holdingId) => {
  const holding = await investmentsService.getHoldingById(userId, holdingId)
  const trades = (await query(SQL.listTradesForCost, [userId])).rows.filter((t) => t.holding_id === holding.id)

  if (holding.price_source) {
    const start = trades.length > 0 ? new Date(`${trades[0].trade_date}T00:00:00Z`) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    start.setUTCDate(start.getUTCDate() - 30)
    const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000)
    const fromDate = dayKey(start < fiveYearsAgo ? fiveYearsAgo : start)
    try {
      const history = await marketData.getHistory(holding.price_source, holding.price_symbol, fromDate)
      let factor = 1
      if (history.currency !== holding.currency) {
        const converted = await currencyService.convertAmount(1_000_000, history.currency, holding.currency)
        if (!converted.available) throw new Error(`No exchange rate from ${history.currency}`)
        factor = converted.amount / 1_000_000
      }
      const points = history.points.map((p) => ({ date: p.date, price: Math.round(p.price * factor * 1e8) / 1e8 }))
      if (points.length > 1) return { source: 'market', currency: holding.currency, points }
    } catch {
      // Falls back to the app's own saved values below.
    }
  }

  // Units held at the end of each trade day, to divide each day's value by.
  const steps = []
  let quantity = 0
  for (const t of trades) {
    quantity += t.type === 'buy' ? Number(t.quantity) : -Number(t.quantity)
    steps.push({ date: t.trade_date, quantity })
  }
  const unitsOn = (date) => {
    let units = steps.length > 0 ? 0 : Number(holding.quantity)
    for (const step of steps) {
      if (step.date > date) break
      units = step.quantity
    }
    return units
  }
  const snapshots = (await query(SQL.getHoldingHistory, [userId, holding.id])).rows
  const byDate = new Map()
  for (const row of snapshots) {
    const units = unitsOn(row.snapshot_date)
    if (row.display_currency !== holding.currency || !(units > 0)) continue
    byDate.set(row.snapshot_date, Math.round((Number(row.total_value) / units) * 1e8) / 1e8)
  }
  // Each trade's own price is a real price on that day too (for a fund, its
  // NAV), and the current price is today's — so a holding with few saved
  // days still gets a line.
  for (const t of trades) {
    if (!byDate.has(t.trade_date) && Number(t.quantity) > 0) byDate.set(t.trade_date, Math.round((Number(t.total_amount) / Number(t.quantity)) * 1e8) / 1e8)
  }
  if (Number(holding.current_price) > 0) byDate.set(dayKey(new Date(Date.now() - new Date().getTimezoneOffset() * 60000)), Number(holding.current_price))
  const points = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, price]) => ({ date, price }))
  return { source: 'recorded', currency: holding.currency, points }
}

module.exports = { getPriceHistory, searchMarket, suggestLinks, linkHolding, unlinkHolding, refreshUserPrices, refreshAllUsersPrices }
