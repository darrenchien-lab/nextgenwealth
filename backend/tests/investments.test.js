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
