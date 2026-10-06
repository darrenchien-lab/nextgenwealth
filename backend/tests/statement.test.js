'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

const createAccount = async (as, name, balance) => (
  (await as.post('/accounts').send({ name, type: 'bank', currency: 'IDR', balance })).body.account
)

test('statement: lists every kind of movement with a running balance that ends on the account balance', async () => {
  const { as } = await createTestUser()
  const main = await createAccount(as, 'Main', 1000000)
  const other = await createAccount(as, 'Other', 0)

  await as.post('/transactions').send({ accountId: main.id, type: 'income', amount: 500000, occurredAt: '2026-01-05T09:00:00' })
  await as.post('/transactions').send({ accountId: main.id, type: 'expense', amount: 200000, occurredAt: '2026-01-06T09:00:00' })
  await as.post('/transfers').send({ fromAccountId: main.id, toAccountId: other.id, amount: 100000, occurredAt: '2026-01-07T09:00:00' })
  await as.post('/investments').send({ assetName: 'TEST', assetType: 'stock', quantity: 10, currency: 'IDR', costBasis: 1000, accountId: main.id })
  await as.patch(`/accounts/${main.id}/adjust`).send({ delta: 50000 })

  const res = await as.get(`/accounts/${main.id}/statement`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.entries.map((e) => e.source), ['transaction', 'transaction', 'transfer_out', 'investment_buy', 'adjustment'])
  assert.deepEqual(res.body.entries.map((e) => e.balanceAfter), [1500000, 1300000, 1200000, 1190000, 1240000])
  assert.equal(res.body.openingBalance, 1000000)
  assert.equal(res.body.closingBalance, 1240000)
  assert.equal(res.body.totalIn, 550000)
  assert.equal(res.body.totalOut, 310000)
  assert.equal(res.body.consistent, true)

  const accounts = (await as.get('/accounts')).body.accounts
  assert.equal(Number(accounts.find((a) => a.id === main.id).balance), res.body.closingBalance)
})

test('statement: a date range returns only that range, with matching opening and closing balances', async () => {
  const { as } = await createTestUser()
  const main = await createAccount(as, 'Main', 1000000)

  await as.post('/transactions').send({ accountId: main.id, type: 'income', amount: 300000, occurredAt: '2026-02-01T09:00:00' })
  await as.post('/transactions').send({ accountId: main.id, type: 'expense', amount: 100000, occurredAt: '2026-02-10T09:00:00' })
  await as.post('/transactions').send({ accountId: main.id, type: 'expense', amount: 50000, occurredAt: '2026-02-20T09:00:00' })

  const res = await as.get(`/accounts/${main.id}/statement?startDate=2026-02-05&endDate=2026-02-15`)
  assert.equal(res.status, 200)
  assert.equal(res.body.entries.length, 1)
  assert.equal(res.body.openingBalance, 1300000)
  assert.equal(res.body.closingBalance, 1200000)
  assert.equal(res.body.totalOut, 100000)
})

test('statement: another user\'s account is not found, and bad dates are rejected', async () => {
  const owner = await createTestUser()
  const intruder = await createTestUser()
  const account = await createAccount(owner.as, 'Private', 1000)

  assert.equal((await intruder.as.get(`/accounts/${account.id}/statement`)).status, 404)
  assert.equal((await owner.as.get(`/accounts/${account.id}/statement?startDate=05-02-2026`)).status, 400)
  assert.equal((await owner.as.get(`/accounts/${account.id}/statement?startDate=2026-03-01&endDate=2026-02-01`)).status, 400)
})
