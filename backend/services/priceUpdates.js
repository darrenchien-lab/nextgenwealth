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
  listUsersWithLinkedHoldings: loadSql('investments/listUsersWithLinkedHoldings')
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

module.exports = { searchMarket, suggestLinks, linkHolding, unlinkHolding, refreshUserPrices, refreshAllUsersPrices }
