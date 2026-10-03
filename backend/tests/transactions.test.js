'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

async function createAccountAndTransaction(as, amount) {
  const accountRes = await as.post('/accounts').send({ name: 'Test Account', type: 'bank', currency: 'IDR', balance: 1000000 })
  const account = accountRes.body.account

  const txnRes = await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount })
  return { account, transaction: txnRes.body.transaction }
}

test('split: rejects when split amounts do not add up to the original total', async () => {
  const { as } = await createTestUser()
  const { transaction } = await createAccountAndTransaction(as, 100000)

  const res = await as.post(`/transactions/${transaction.id}/split`).send({
    splits: [{ amount: 40000 }, { amount: 40000 }] // sums to 80000, not 100000
  })

  assert.equal(res.status, 400)
  assert.equal(res.body.success, false)
})

test('split: rejects fewer than 2 splits', async () => {
  const { as } = await createTestUser()
  const { transaction } = await createAccountAndTransaction(as, 100000)

  const res = await as.post(`/transactions/${transaction.id}/split`).send({
    splits: [{ amount: 100000 }]
  })

  assert.equal(res.status, 400)
})

test('split: accepts splits that add up exactly, replaces original with the parts, leaves account balance untouched', async () => {
  const { as } = await createTestUser()
  const { account, transaction } = await createAccountAndTransaction(as, 100000)

  const beforeBalance = Number((await as.get('/accounts')).body.accounts.find((a) => a.id === account.id).balance)

  const res = await as.post(`/transactions/${transaction.id}/split`).send({
    splits: [{ amount: 30000 }, { amount: 70000 }]
  })

  assert.equal(res.status, 201)
  assert.equal(res.body.success, true)
  assert.equal(res.body.transactions.length, 2)

  const sum = res.body.transactions.reduce((acc, t) => acc + Number(t.amount), 0)
  assert.equal(sum, 100000)

  // Original transaction should no longer exist
  const originalStillThere = await as.patch(`/transactions/${transaction.id}`).send({ notes: 'should 404' })
  assert.equal(originalStillThere.status, 404)

  const afterBalance = Number((await as.get('/accounts')).body.accounts.find((a) => a.id === account.id).balance)
  assert.equal(afterBalance, beforeBalance, 'splitting must not change the account balance')
})

test('split: rounds cleanly for amounts that do not divide evenly (e.g. three even thirds)', async () => {
  const { as } = await createTestUser()
  const { transaction } = await createAccountAndTransaction(as, 100)

  const res = await as.post(`/transactions/${transaction.id}/split`).send({
    splits: [{ amount: 33.33 }, { amount: 33.33 }, { amount: 33.34 }]
  })

  assert.equal(res.status, 201)
})
