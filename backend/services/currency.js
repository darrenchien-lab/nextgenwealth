'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { isValidCurrencyCode } = require('../shared/currencyCodes')

const SQL = {
  getRateVsUsd: loadSql('currency/getRateVsUsd'),
  insertRate: loadSql('currency/insertRate'),
  listSupportedCurrencies: loadSql('currency/listSupportedCurrencies'),
  getCacheStaleness: loadSql('currency/getCacheStaleness')
}

// Switched from Frankfurter.app (ECB-sourced, ~30 currencies, no TWD) to
// open.er-api.com (exchangerate-api.com's free/keyless mirror, ~170
// currencies including TWD) — see design.md for the currency-coverage gap
// that prompted this.
const RATES_API_URL = 'https://open.er-api.com/v6/latest/USD'

// All rates are cached relative to USD so any pair can be converted by going
// through USD as a bridge, instead of caching every possible pair directly.
const getRateVsUsd = async (currency) => {
  const code = currency.toUpperCase()
  if (code === 'USD') return { rate: 1, fetchedAt: new Date() }

  const result = await query(SQL.getRateVsUsd, [code])
  const row = result.rows[0]
  if (!row) return null
  return { rate: Number(row.rate), fetchedAt: row.fetched_at }
}

// Reading "the latest row" for a pair is itself the fallback mechanism: if
// today's scheduled fetch failed, no new row was inserted, so this query
// naturally returns the most recent previously cached rate instead.
const convertAmount = async (amount, fromCurrency, toCurrency) => {
  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()
  if (from === to) return { amount, available: true, asOf: null }

  const [rateFrom, rateTo] = await Promise.all([getRateVsUsd(from), getRateVsUsd(to)])
  if (!rateFrom || !rateTo) {
    return { amount: null, available: false, asOf: null }
  }

  const amountInUsd = amount / rateFrom.rate
  const converted = Math.round(amountInUsd * rateTo.rate * 100) / 100
  const asOf = rateFrom.fetchedAt < rateTo.fetchedAt ? rateFrom.fetchedAt : rateTo.fetchedAt
  return { amount: converted, available: true, asOf }
}

// Runs once a day from the scheduler. On failure it deliberately swallows the
// error and leaves the existing cache in place, per the Exchange Rate
// Refresh / Fallback requirements — a rate-provider outage must not break
// requests that depend on currency conversion.
const fetchAndCacheDailyRates = async () => {
  let response
  try {
    response = await fetch(RATES_API_URL)
  } catch (err) {
    console.error('Exchange rate fetch failed (network error):', err.message)
    return { success: false }
  }

  if (!response.ok) {
    console.error(`Exchange rate fetch failed: HTTP ${response.status}`)
    return { success: false }
  }

  const data = await response.json()
  if (data.result !== 'success') {
    console.error(`Exchange rate fetch failed: provider returned result="${data.result}"`)
    return { success: false }
  }

  const fetchedAt = new Date()
  const entries = Object.entries(data.rates || {}).filter(([code]) => isValidCurrencyCode(code))
  entries.push(['USD', 1])

  for (const [code, rate] of entries) {
    await query(SQL.insertRate, [code, rate, fetchedAt])
  }

  return { success: true, fetchedAt, pairCount: entries.length }
}

// Lists every currency we actually have a cached rate for, so UI dropdowns
// only offer currencies that will convert successfully, rather than the
// full (and only loosely validated) ISO 4217 list in shared/currencyCodes.
const getSupportedCurrencies = async () => {
  const result = await query(SQL.listSupportedCurrencies)
  return result.rows.map((row) => row.quote_currency)
}

const getCacheStaleness = async () => {
  const result = await query(SQL.getCacheStaleness)
  const lastFetchedAt = result.rows[0].last_fetched_at
  if (!lastFetchedAt) return { lastFetchedAt: null, daysSinceLastFetch: null }
  const daysSinceLastFetch = (Date.now() - new Date(lastFetchedAt).getTime()) / (1000 * 60 * 60 * 24)
  return { lastFetchedAt, daysSinceLastFetch }
}

// Called on server startup (see jobs/scheduler.js) so a server that isn't
// left running overnight still gets a same-day rate as soon as it's used,
// instead of waiting on the 01:00 cron to happen to catch it running.
const catchUpIfStale = async () => {
  const { daysSinceLastFetch } = await getCacheStaleness()
  if (daysSinceLastFetch === null || daysSinceLastFetch >= 1) {
    await fetchAndCacheDailyRates()
  }
}

module.exports = { convertAmount, fetchAndCacheDailyRates, getCacheStaleness, getSupportedCurrencies, catchUpIfStale }
