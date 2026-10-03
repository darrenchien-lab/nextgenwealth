'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

test('a user cannot read another user\'s account by id-guessing, and gets 404 (not 403) so existence isn\'t leaked', async () => {
  const owner = await createTestUser()
  const intruder = await createTestUser()

  const createRes = await owner.as.post('/accounts').send({ name: 'Owner Account', type: 'bank', currency: 'IDR', balance: 500000 })
  const accountId = createRes.body.account.id

  const res = await intruder.as.post(`/accounts/${accountId}/archive`)
  assert.equal(res.status, 404)
  assert.equal(res.body.success, false)
})

test('a user cannot delete another user\'s transaction', async () => {
  const owner = await createTestUser()
  const intruder = await createTestUser()

  const accountRes = await owner.as.post('/accounts').send({ name: 'Owner Account', type: 'bank', currency: 'IDR', balance: 500000 })
  const account = accountRes.body.account
  const txnRes = await owner.as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 10000 })
  const transactionId = txnRes.body.transaction.id

  const res = await intruder.as.delete(`/transactions/${transactionId}`)
  assert.equal(res.status, 404)

  // Confirm it's untouched — the owner can still see/act on it
  const ownerCheck = await owner.as.patch(`/transactions/${transactionId}`).send({ notes: 'still mine' })
  assert.equal(ownerCheck.status, 200)
})

test('a user only sees their own accounts, never another user\'s', async () => {
  const userA = await createTestUser()
  const userB = await createTestUser()

  await userA.as.post('/accounts').send({ name: 'A Only', type: 'cash', currency: 'IDR', balance: 1000 })
  await userB.as.post('/accounts').send({ name: 'B Only', type: 'cash', currency: 'IDR', balance: 2000 })

  const listA = await userA.as.get('/accounts')
  const names = listA.body.accounts.map((a) => a.name)
  assert.ok(names.includes('A Only'))
  assert.ok(!names.includes('B Only'))
})
