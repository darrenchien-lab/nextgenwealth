'use strict'
const { test, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')
const marketData = require('../services/marketData')
const priceUpdates = require('../services/priceUpdates')

// Fake market: no network in tests.
const quotes = {}
const listings = []
const original = { getQuote: marketData.getQuote, search: marketData.search }
beforeEach(() => {
  for (const key of Object.keys(quotes)) delete quotes[key]
  listings.length = 0
  marketData.getQuote = async (source, symbol) => {
    const quote = quotes[`${source}:${symbol}`]
    if (!quote) throw new Error(`No price found for ${symbol}`)
    return { ...quote, asOf: new Date(), name: symbol }
  }
  marketData.search = async () => listings
})
after(async () => {
  Object.assign(marketData, original)
  await cleanupTestUsers()
})

const findHolding = async (as, id) => (await as.get('/investments/portfolio')).body.holdings.find((h) => h.id === id)

test('prices: linking a holding sets its price from the market, and refreshing keeps it current', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const holding = (await as.post('/investments').send({ assetName: 'BBCA', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 600000, price: 6000 })).body.holding

  quotes['yahoo:BBCA.JK'] = { price: 5175, currency: 'IDR' }
  const linked = await as.put(`/investments/${holding.id}/price-source`).send({ source: 'yahoo', symbol: 'BBCA.JK' })
  assert.equal(linked.status, 200)
  let h = await findHolding(as, holding.id)
  assert.equal(Number(h.current_price), 5175)
  assert.equal(h.price_source, 'yahoo')
  assert.ok(h.price_updated_at)

  // The market moves; a refresh follows it and the portfolio value with it.
  quotes['yahoo:BBCA.JK'] = { price: 5300, currency: 'IDR' }
  const refreshed = (await as.post('/investments/prices/refresh')).body
  assert.equal(refreshed.updated, 1)
  h = await findHolding(as, holding.id)
  assert.equal(Number(h.current_price), 5300)
  assert.equal(h.currentValue, 530000)

  // A failing source keeps the last price and says why.
  delete quotes['yahoo:BBCA.JK']
  const failedRun = (await as.post('/investments/prices/refresh')).body
  assert.equal(failedRun.failed.length, 1)
  h = await findHolding(as, holding.id)
  assert.equal(Number(h.current_price), 5300)
  assert.match(h.price_error, /No price found/)

  // Back to manual: the price stays, the link goes.
  await as.delete(`/investments/${holding.id}/price-source`)
  h = await findHolding(as, holding.id)
  assert.equal(h.price_source, null)
  assert.equal(Number(h.current_price), 5300)
})

test('prices: a listing in another currency is converted, unknown sources and others\' holdings are refused', async () => {
  const { as } = await createTestUser()
  const other = await createTestUser()
  const holding = (await as.post('/investments').send({ assetName: 'Same', assetType: 'stock', quantity: 1, currency: 'USD', totalSpent: 10, price: 10 })).body.holding

  quotes['yahoo:SAME'] = { price: 12, currency: 'USD' }
  assert.equal((await as.put(`/investments/${holding.id}/price-source`).send({ source: 'nowhere', symbol: 'X' })).status, 400)
  assert.equal((await as.put(`/investments/${holding.id}/price-source`).send({ source: 'yahoo', symbol: 'MISSING' })).status, 400)
  assert.equal((await other.as.put(`/investments/${holding.id}/price-source`).send({ source: 'yahoo', symbol: 'SAME' })).status, 404)
  assert.equal((await as.put(`/investments/${holding.id}/price-source`).send({ source: 'yahoo', symbol: 'SAME' })).status, 200)
})

test('prices: a new holding can be linked when it is added, and suggestions only offer listings in its currency', async () => {
  const { as } = await createTestUser()
  quotes['indodax:btcidr'] = { price: 1460000000, currency: 'IDR' }
  const created = await as.post('/investments').send({
    assetName: 'BTC', assetType: 'crypto', quantity: 0.001, currency: 'IDR', totalSpent: 1450000, price: 1450000000, priceSource: 'indodax', priceSymbol: 'btcidr'
  })
  assert.equal(created.status, 201)
  assert.equal(Number(created.body.holding.current_price), 1460000000)

  await as.post('/investments').send({ assetName: 'BCA', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 500000, price: 5000 })
  listings.push(
    { source: 'yahoo', symbol: 'BCAT', name: 'Unrelated US fund', exchange: 'NYSE', currency: 'USD', price: 15 },
    { source: 'yahoo', symbol: 'BBCA.JK', name: 'Bank Central Asia', exchange: 'Jakarta', currency: 'IDR', price: 5175 }
  )
  const { suggestions } = (await as.get('/investments/market/suggestions')).body
  const bca = suggestions.find((s) => s.assetName === 'BCA')
  assert.deepEqual(bca.candidates.map((c) => c.symbol), ['BBCA.JK'])
  // "BCA" isn't BBCA's code, so nothing is picked for the user.
  assert.equal(bca.recommended, -1)
  // Already linked holdings aren't suggested again.
  assert.equal(suggestions.some((s) => s.assetName === 'BTC'), false)
})
