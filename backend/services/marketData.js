'use strict'
// Market prices from public sources, behind one small interface so a source
// can be swapped without touching the rest of the app:
//   search(query)            -> candidates a holding could be linked to
//   getQuote(source, symbol) -> { price, currency, asOf, name }
//
// Sources:
//   yahoo   — Yahoo Finance's public chart/search endpoints. Not an official
//             API (no key, no guarantee), but covers most exchanges: IDX
//             (BBCA.JK), Taiwan (0050.TW), London (CSPX.L), US, Tokyo, ...
//   indodax — Indodax's public ticker API, for crypto priced in rupiah.

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (NextGen Wealth price updater)' }
const TIMEOUT_MS = 10000

const fetchJson = async (url) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'The price source took too long to answer' : `Price source error: ${err.message}`)
  } finally {
    clearTimeout(timer)
  }
}

// Yahoo quotes some London/Johannesburg/Tel Aviv prices in the minor unit.
const MINOR_UNITS = { GBp: 'GBP', GBX: 'GBP', ZAc: 'ZAR', ILA: 'ILS' }
const YAHOO_TYPES = { EQUITY: 'stock', ETF: 'etf', MUTUALFUND: 'mutual_fund', CRYPTOCURRENCY: 'crypto' }

const yahooQuote = async (symbol) => {
  const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`)
  const meta = data.chart?.result?.[0]?.meta
  if (!meta || !(Number(meta.regularMarketPrice) > 0)) throw new Error(`No price found for ${symbol}`)
  let price = Number(meta.regularMarketPrice)
  let currency = meta.currency
  if (MINOR_UNITS[currency]) {
    price /= 100
    currency = MINOR_UNITS[currency]
  }
  return {
    price,
    currency: currency.toUpperCase(),
    asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date(),
    name: meta.longName || meta.shortName || symbol
  }
}

const yahooSearch = async (query) => {
  const data = await fetchJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`)
  return (data.quotes || [])
    .filter((q) => YAHOO_TYPES[q.quoteType] && q.symbol)
    .map((q) => ({
      source: 'yahoo',
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange || '',
      assetType: YAHOO_TYPES[q.quoteType]
    }))
}

// Indodax lists pairs by ticker only; common full names map to them.
const CRYPTO_NAMES = { bitcoin: 'btc', ethereum: 'eth', ether: 'eth', solana: 'sol', tether: 'usdt', ripple: 'xrp', dogecoin: 'doge', cardano: 'ada', 'binance coin': 'bnb', polygon: 'pol', litecoin: 'ltc', tron: 'trx' }
let indodaxPairs = null
let indodaxPairsAt = 0

const getIndodaxPairs = async () => {
  if (!indodaxPairs || Date.now() - indodaxPairsAt > 24 * 60 * 60 * 1000) {
    const pairs = await fetchJson('https://indodax.com/api/pairs')
    indodaxPairs = pairs.filter((p) => p.base_currency === 'idr')
    indodaxPairsAt = Date.now()
  }
  return indodaxPairs
}

const indodaxSearch = async (query) => {
  const words = query.trim().toLowerCase()
  const code = CRYPTO_NAMES[words] || words
  const pairs = await getIndodaxPairs()
  return pairs
    .filter((p) => p.traded_currency === code)
    .map((p) => ({
      source: 'indodax',
      symbol: p.id,
      name: `${(p.traded_currency_unit || p.traded_currency).toUpperCase()} in rupiah`,
      exchange: 'Indodax',
      assetType: 'crypto'
    }))
}

const indodaxQuote = async (pairId) => {
  const data = await fetchJson(`https://indodax.com/api/ticker/${encodeURIComponent(pairId)}`)
  const price = Number(data.ticker?.last)
  if (!(price > 0)) throw new Error(`No price found for ${pairId}`)
  return {
    price,
    currency: 'IDR',
    asOf: data.ticker.server_time ? new Date(Number(data.ticker.server_time) * 1000) : new Date(),
    name: `${pairId.replace(/idr$/, '').toUpperCase()} in rupiah`
  }
}

// Daily closes since `fromDate` ('YYYY-MM-DD'), each dated in the exchange's
// own time zone so a Jakarta close isn't filed under the previous UTC day.
const yahooHistory = async (symbol, fromDate) => {
  const from = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000)
  const to = Math.floor(Date.now() / 1000)
  const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d`)
  const result = data.chart?.result?.[0]
  if (!result?.timestamp) throw new Error(`No price history found for ${symbol}`)
  const offset = Number(result.meta?.gmtoffset) || 0
  const divisor = MINOR_UNITS[result.meta?.currency] ? 100 : 1
  const closes = result.indicators?.quote?.[0]?.close || []
  const points = []
  result.timestamp.forEach((t, i) => {
    if (closes[i] === null || closes[i] === undefined) return
    points.push({ date: new Date((t + offset) * 1000).toISOString().slice(0, 10), price: closes[i] / divisor })
  })
  const currency = MINOR_UNITS[result.meta?.currency] || result.meta?.currency
  return { currency: String(currency).toUpperCase(), points }
}

const indodaxHistory = async (pairId, fromDate) => {
  const from = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000)
  const to = Math.floor(Date.now() / 1000)
  const data = await fetchJson(`https://indodax.com/tradingview/history_v2?symbol=${encodeURIComponent(pairId.toUpperCase())}&tf=1D&from=${from}&to=${to}`)
  if (!Array.isArray(data)) throw new Error(`No price history found for ${pairId}`)
  return {
    currency: 'IDR',
    points: data
      .filter((c) => Number(c.Close) > 0)
      .map((c) => ({ date: new Date(c.Time * 1000).toISOString().slice(0, 10), price: Number(c.Close) }))
  }
}

const SOURCES = {
  yahoo: { quote: yahooQuote, search: yahooSearch, history: yahooHistory, label: 'Yahoo Finance' },
  indodax: { quote: indodaxQuote, search: indodaxSearch, history: indodaxHistory, label: 'Indodax' }
}

const isKnownSource = (source) => Boolean(SOURCES[source])

// Past daily closes are the same for everyone and change once a day, so a
// lookup is kept for an hour instead of asking the source on every page view.
const HISTORY_CACHE_MS = 60 * 60 * 1000
const historyCache = new Map()

const getHistory = async (source, symbol, fromDate) => {
  if (!SOURCES[source]) throw new Error(`Unknown price source: ${source}`)
  const key = `${source}:${symbol}:${fromDate}`
  const cached = historyCache.get(key)
  if (cached && Date.now() - cached.at < HISTORY_CACHE_MS) return cached.value
  const value = await SOURCES[source].history(symbol, fromDate)
  historyCache.set(key, { at: Date.now(), value })
  return value
}

const getQuote = async (source, symbol) => {
  if (!SOURCES[source]) throw new Error(`Unknown price source: ${source}`)
  return SOURCES[source].quote(symbol)
}

// Candidates from every source, each with its current price and currency
// (Yahoo's search doesn't say which currency a listing trades in, so the top
// results are quoted to find out). Results that can't be priced are dropped.
const search = async (query) => {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  // Up to six from each source, so a broad source can't crowd out a
  // narrower one (Yahoo's many 'bitcoin' listings vs Indodax's one).
  const found = []
  for (const source of Object.values(SOURCES)) {
    try {
      found.push(...(await source.search(q)).slice(0, 6))
    } catch {
      // One source being down shouldn't hide the others' results.
    }
  }
  const priced = await Promise.all(found.map(async (candidate) => {
    try {
      const quote = await getQuote(candidate.source, candidate.symbol)
      return { ...candidate, price: quote.price, currency: quote.currency }
    } catch {
      return null
    }
  }))
  return priced.filter(Boolean)
}

module.exports = { search, getQuote, getHistory, isKnownSource, SOURCE_LABELS: { yahoo: 'Yahoo Finance', indodax: 'Indodax' } }
