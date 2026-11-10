'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

const localDay = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('investments: a top-up and a sale are logged on the date given, and future dates are rejected', async () => {
  const { as } = await createTestUser()
  const account = (await as.post('/accounts').send({ name: 'Broker cash', type: 'e_wallet', currency: 'IDR', balance: 10000000 })).body.account
  const holding = (await as.post('/investments').send({
    assetName: 'TEST', assetType: 'stock', quantity: 100, currency: 'IDR', costBasis: 1000, purchasedAt: '2026-01-05'
  })).body.holding

  const add = await as.post(`/investments/${holding.id}/add`).send({ quantity: 50, costBasis: 1200, accountId: account.id, date: '2026-02-10' })
  assert.equal(add.status, 200)
  const remove = await as.post(`/investments/${holding.id}/remove`).send({ quantity: 20, date: '2026-03-15' })
  assert.equal(remove.status, 200)

  const log = (await as.get('/investments/transactions')).body.transactions
  const byType = (type) => log.filter((t) => t.type === type).map((t) => localDay(t.occurred_at)).sort()
  assert.deepEqual(byType('buy'), ['2026-01-05', '2026-02-10'])
  assert.deepEqual(byType('sell'), ['2026-03-15'])

  // The cash leaving the linked account shows up on that date in its statement too.
  const statement = (await as.get(`/accounts/${account.id}/statement`)).body
  const buy = statement.entries.find((e) => e.source === 'investment_buy')
  assert.equal(localDay(buy.occurredAt), '2026-02-10')
  assert.equal(buy.amount, -60000)

  const future = await as.post(`/investments/${holding.id}/add`).send({ quantity: 1, costBasis: 1000, date: '2999-01-01' })
  assert.equal(future.status, 400)
})

test('investments: a new holding can be entered by the total paid, fees included', async () => {
  const { as } = await createTestUser()
  const account = (await as.post('/accounts').send({ name: 'Broker', type: 'bank', currency: 'TWD', balance: 100000 })).body.account

  const res = await as.post('/investments').send({
    assetName: '0050', assetType: 'etf', quantity: 233, currency: 'TWD', totalSpent: 27003, accountId: account.id
  })
  assert.equal(res.status, 201)
  assert.equal(Number(res.body.holding.cost_basis_total), 27003)
  assert.ok(Math.abs(Number(res.body.holding.current_price) - 27003 / 233) < 0.0001)

  const accounts = (await as.get('/accounts')).body.accounts
  assert.equal(Number(accounts.find((a) => a.id === account.id).balance), 100000 - 27003)

  // With the market price given, the cost basis keeps the fee but the last price doesn't.
  const withPrice = await as.post('/investments').send({
    assetName: '0056', assetType: 'etf', quantity: 233, currency: 'TWD', totalSpent: 27003, price: 115.85
  })
  assert.equal(Number(withPrice.body.holding.cost_basis_total), 27003)
  assert.equal(Number(withPrice.body.holding.current_price), 115.85)

  const negative = await as.post('/investments').send({ assetName: 'X', assetType: 'etf', quantity: 1, currency: 'TWD', totalSpent: -1 })
  assert.equal(negative.status, 400)
})

test('investments: adding to a holding by total paid keeps the fee in cost and leaves the last price alone', async () => {
  const { as } = await createTestUser()
  const account = (await as.post('/accounts').send({ name: 'Broker', type: 'bank', currency: 'TWD', balance: 100000 })).body.account
  const holding = (await as.post('/investments').send({ assetName: '0050', assetType: 'etf', quantity: 100, currency: 'TWD', totalSpent: 11000, price: 110 })).body.holding

  const withoutPrice = await as.post(`/investments/${holding.id}/add`).send({ quantity: 10, totalSpent: 1205, accountId: account.id })
  assert.equal(Number(withoutPrice.body.holding.cost_basis_total), 12205)
  assert.equal(Number(withoutPrice.body.holding.current_price), 110)

  const withPrice = await as.post(`/investments/${holding.id}/add`).send({ quantity: 10, totalSpent: 1255, price: 125, accountId: account.id })
  assert.equal(Number(withPrice.body.holding.quantity), 120)
  assert.equal(Number(withPrice.body.holding.cost_basis_total), 13460)
  // The last price is only set when the holding is created; a later purchase price does not replace it.
  assert.equal(Number(withPrice.body.holding.current_price), 110)

  const accounts = (await as.get('/accounts')).body.accounts
  assert.equal(Number(accounts.find((a) => a.id === account.id).balance), 100000 - 1205 - 1255)
})

test('investments: fees are tracked per purchase, shrink with sales, and the detail shows cost basis with and without them', async () => {
  const { as } = await createTestUser()
  const holding = (await as.post('/investments').send({ assetName: 'FEE', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 1001500, price: 10000 })).body.holding
  assert.equal(Number(holding.fees_total), 1500)

  await as.post(`/investments/${holding.id}/add`).send({ quantity: 100, totalSpent: 1101650, price: 11000 })
  await as.post(`/investments/${holding.id}/add`).send({ quantity: 100, totalSpent: 1200000 }) // no price: fee unknown

  let detail = (await as.get(`/investments/${holding.id}/detail`)).body.holding
  assert.equal(detail.quantity, 300)
  assert.equal(detail.costBasis, 3303150)
  assert.equal(detail.feesTotal, 3150)
  assert.equal(detail.costBasisExcludingFees, 3300000)
  assert.deepEqual(detail.transactions.map((t) => t.fee).sort(), [1500, 1650, null].sort())

  // Selling a third of the units takes a third of the fees with it.
  await as.post(`/investments/${holding.id}/remove`).send({ quantity: 100 })
  detail = (await as.get(`/investments/${holding.id}/detail`)).body.holding
  assert.equal(detail.quantity, 200)
  assert.equal(detail.feesTotal, 2100)
  assert.equal(detail.costBasis, 2202100)
  assert.equal(detail.costBasisExcludingFees, 2200000)
})

test('investments: value history can be shown for one holding, and only for your own', async () => {
  const { as } = await createTestUser()
  const other = await createTestUser()
  const a = (await as.post('/investments').send({ assetName: 'AAA', assetType: 'stock', quantity: 10, currency: 'IDR', totalSpent: 1000, price: 100 })).body.holding
  await as.post('/investments').send({ assetName: 'BBB', assetType: 'stock', quantity: 1, currency: 'IDR', totalSpent: 5000, price: 5000 })

  const all = (await as.get('/investments/history')).body.history
  const one = (await as.get(`/investments/history?holdingId=${a.id}`)).body.history
  assert.equal(all[all.length - 1].totalValue, 6000)
  assert.equal(one[one.length - 1].totalValue, 1000)
  assert.equal(one[one.length - 1].totalCostBasis, 1000)

  assert.equal((await other.as.get(`/investments/history?holdingId=${a.id}`)).status, 404)
  assert.equal((await as.get('/investments/history?holdingId=abc')).status, 400)
})

test('investments: the capital line is rebuilt from trades back to the first purchase when they cover the whole holding', async () => {
  const { user, as } = await createTestUser()
  const { pool } = require('./helpers')
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const holding = (await as.post('/investments').send({ assetName: 'OLD', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 100000, price: 1000 })).body.holding
  // The purchase happened long before the reliable cost snapshots began, and
  // there's an old daily value from then.
  await pool.query("UPDATE investment_transactions SET occurred_at = '2025-03-01 12:00:00' WHERE holding_id = $1", [holding.id])
  await pool.query(
    "INSERT INTO investment_holding_snapshots (user_id, holding_id, snapshot_date, asset_name, value, cost_basis, display_currency) VALUES ($1, $2, '2025-04-01', 'OLD', 120000, 999999, 'IDR'), ($1, $2, '2025-02-01', 'OLD', 1, 1, 'IDR')",
    [user.id, holding.id]
  )
  const history = (await as.get(`/investments/history?holdingId=${holding.id}`)).body.history
  const byDate = Object.fromEntries(history.map((h) => [h.date, h.totalCostBasis]))
  assert.equal(byDate['2025-04-01'], 100000) // from the trade, not the snapshot's placeholder
  assert.equal(byDate['2025-02-01'], null) // before the first purchase

  // A holding whose trades don't cover it keeps the old behaviour (no line before reliable snapshots).
  await as.post(`/investments/${holding.id}/add`).send({ quantity: 10, totalSpent: 10000, price: 1000, accountId: undefined })
  await pool.query('UPDATE investment_holdings SET quantity = quantity + 5 WHERE id = $1', [holding.id])
  const partial = (await as.get(`/investments/history?holdingId=${holding.id}`)).body.history
  assert.equal(partial.find((h) => h.date === '2025-04-01').totalCostBasis, null)
})

test('investments: the actual return counts each purchase from its own date (XIRR)', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const yearAgo = new Date(Date.now() - 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const holding = (await as.post('/investments').send({
    assetName: 'XIRR', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 1000000, price: 10000, purchasedAt: yearAgo
  })).body.holding
  await as.patch(`/investments/${holding.id}/price`).send({ currentPrice: 11000 })
  let res = (await as.get('/investments/allocation-targets')).body
  assert.equal(res.actualXirr.available, true)
  assert.ok(Math.abs(res.actualXirr.xirr - 10) < 0.2, `expected about 10%, got ${res.actualXirr.xirr}`)

  // A big top-up today barely changes the yearly rate: that money hasn't had time to grow yet.
  await as.post(`/investments/${holding.id}/add`).send({ quantity: 100, totalSpent: 1100000 })
  res = (await as.get('/investments/allocation-targets')).body
  assert.ok(Math.abs(res.actualXirr.xirr - 10) < 0.5, `expected about 10%, got ${res.actualXirr.xirr}`)
})

test('investments: a sale records the price and amount received, credits the receiving account and books the realized gain after fees', async () => {
  const { as } = await createTestUser()
  const rdn = (await as.post('/accounts').send({ name: 'RDN', type: 'bank', currency: 'IDR', balance: 2000000 })).body.account
  const usd = (await as.post('/accounts').send({ name: 'USD cash', type: 'bank', currency: 'USD', balance: 10 })).body.account
  const holding = (await as.post('/investments').send({
    assetName: 'SELL', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 1001000, price: 10000, accountId: rdn.id
  })).body.holding

  // The account must be in the holding's currency, and you can't sell more than you hold.
  assert.equal((await as.post(`/investments/${holding.id}/remove`).send({ quantity: 10, price: 12000, accountId: usd.id })).status, 400)
  assert.equal((await as.post(`/investments/${holding.id}/remove`).send({ quantity: 101, price: 12000 })).status, 400)

  const res = await as.post(`/investments/${holding.id}/remove`).send({ quantity: 40, price: 12000, totalReceived: 478800, accountId: rdn.id })
  assert.equal(res.status, 200)
  assert.equal(Number(res.body.holding.quantity), 60)
  // Cost of 40 units, fee included: 1,001,000 × 40/100 = 400,400 → gain 78,400.
  assert.equal(res.body.holding.sale.realizedGain, 78400)
  assert.equal(res.body.holding.sale.fee, 1200)

  const account = (await as.get(`/accounts/${rdn.id}/statement`)).body
  assert.equal(account.account.balance, 2000000 - 1001000 + 478800)
  assert.equal(account.entries.find((e) => e.source === 'investment_sell').amount, 478800)

  const sell = (await as.get('/investments/transactions')).body.transactions.find((t) => t.type === 'sell')
  assert.equal(Number(sell.price_per_unit), 12000)
  assert.equal(Number(sell.total_amount), 478800)
})

test('investments: the cycle result is the change in value minus what was bought, so buying more is never a gain', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const holding = (await as.post('/investments').send({
    assetName: 'PERF', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 1001000, price: 10000
  })).body.holding

  // Bought this cycle and nothing else yet: counted at quantity × price, so
  // the Rp 1,000 fee isn't a loss here and the result is zero.
  let res = (await as.get('/investments/performance')).body
  assert.equal(res.bought, 1000000)
  assert.equal(res.pnl, 0)

  // The price rises 10%: that, and only that, is the cycle's gain.
  await as.patch(`/investments/${holding.id}/price`).send({ currentPrice: 11000 })
  res = (await as.get('/investments/performance')).body
  assert.equal(res.endValue, 1100000)
  assert.equal(res.pnl, 100000)
  assert.equal(res.holdings.find((h) => h.name === 'PERF').pnl, 100000)
  assert.ok(res.percent > 9 && res.percent <= 10, `expected about 10%, got ${res.percent}`)

  // Buying more at the market price adds money in, not profit.
  await as.post(`/investments/${holding.id}/add`).send({ quantity: 100, price: 11000, totalSpent: 1101000 })
  res = (await as.get('/investments/performance')).body
  assert.equal(res.bought, 2100000)
  assert.equal(res.pnl, 100000)
})

test('investments: the result can be measured over any date range, and a bad range is refused', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const holding = (await as.post('/investments').send({ assetName: 'RNG', assetType: 'stock', quantity: 10, currency: 'IDR', totalSpent: 100000, price: 10000 })).body.holding
  await as.patch(`/investments/${holding.id}/price`).send({ currentPrice: 12000 })
  const today = new Date()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const res = (await as.get(`/investments/performance?startDate=${key}&endDate=${key}`)).body
  assert.equal(res.pnl, 20000)
  assert.equal(res.holdings[0].name, 'RNG')
  assert.equal((await as.get('/investments/performance?startDate=not-a-date')).status, 400)
  assert.equal((await as.get(`/investments/performance?startDate=${key}&endDate=2000-01-01`)).status, 400)
})
