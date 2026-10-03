'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

test('net worth: spending on a credit card lowers net worth, and paying the card off leaves it unchanged', async () => {
  const { as } = await createTestUser()

  const bank = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 5000000 })).body.account
  const card = (await as.post('/accounts').send({ name: 'Card', type: 'credit_card', currency: 'IDR', balance: 0 })).body.account

  await as.post('/transactions').send({ accountId: card.id, type: 'expense', amount: 500000 })
  const afterSpending = await as.get('/accounts/net-worth')
  assert.equal(afterSpending.body.netWorth, 4500000)

  await as.post('/transfers').send({ fromAccountId: bank.id, toAccountId: card.id, amount: 500000 })
  const afterPayment = await as.get('/accounts/net-worth')
  assert.equal(afterPayment.body.netWorth, 4500000)

  const accounts = (await as.get('/accounts')).body.accounts
  assert.equal(Number(accounts.find((a) => a.id === card.id).balance), 0)
})

test('net worth: an existing credit card debt entered as a negative balance is subtracted', async () => {
  const { as } = await createTestUser()

  await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 5000000 })
  await as.post('/accounts').send({ name: 'Card', type: 'credit_card', currency: 'IDR', balance: -500000 })

  const res = await as.get('/accounts/net-worth')
  assert.equal(res.body.netWorth, 4500000)
})
