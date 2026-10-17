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
