'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')
const smartEntry = require('../services/smartEntry')

after(async () => {
  await cleanupTestUsers()
})

const NOW = new Date(2026, 10, 13) // 13 Nov 2026

test('smart entry: a stock bought in lots becomes shares, and the missing figure is worked out', async () => {
  const { as, user } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  await as.post('/accounts').send({ name: 'BCA', type: 'bank', currency: 'IDR', balance: 50000000 })
  await as.post('/accounts').send({ name: 'Gopay', type: 'e_wallet', currency: 'IDR', balance: 100000 })

  const fake = async () => ({
    actions: [
      { kind: 'buy', date: '2026-11-12', assetName: 'BBCA', assetType: 'stock', quantity: 10, quantityUnit: 'lot', price: 9200, account: 'bca', currency: 'IDR' },
      { kind: 'transaction', date: '2026-11-13', txType: 'expense', amount: 45000, account: 'Gopay', category: null, notes: 'makan siang' }
    ]
  })
  const result = await smartEntry.parse(user.id, 'kemarin beli BBCA 10 lot 9200, makan siang 45rb gopay', { callModel: fake, now: NOW })

  assert.equal(result.drafts.length, 2)
  const buy = result.drafts[0]
  assert.equal(buy.kind, 'buy')
  assert.equal(buy.quantity, 1000)
  assert.equal(buy.price, 9200)
  assert.equal(buy.total, 9200000)
  assert.equal(buy.holdingId, null)
  assert.ok(buy.accountId)
  assert.deepEqual(buy.issues, [])

  const spend = result.drafts[1]
  assert.equal(spend.type, 'expense')
  assert.equal(spend.amount, 45000)
  assert.equal(spend.notes, 'makan siang')
  assert.equal(result.context.accounts.length, 2)
  // Only names and ids go back; no balances.
  assert.equal(result.context.accounts[0].balance, undefined)
})

test('smart entry: unclear parts are flagged instead of guessed', async () => {
  const { as, user } = await createTestUser()
  await as.post('/accounts').send({ name: 'BCA Utama', type: 'bank', currency: 'IDR', balance: 1000 })
  await as.post('/accounts').send({ name: 'BCA Tabungan', type: 'bank', currency: 'IDR', balance: 1000 })

  const fake = async () => ({
    actions: [
      { kind: 'transaction', date: '2099-01-01', txType: 'income', amount: 8000000, account: 'BCA' },
      { kind: 'sell', date: null, assetName: 'GOTO', quantity: 5, price: 80 },
      { kind: 'transfer', date: null, amount: 100000, account: 'BCA Utama', toAccount: 'Dana' },
      { kind: 'transaction', date: 'not-a-date', txType: 'expense', amount: null, account: 'BCA Utama' }
    ]
  })
  const { drafts } = await smartEntry.parse(user.id, 'banyak hal', { callModel: fake, now: NOW })

  assert.equal(drafts[0].accountId, null)
  assert.ok(drafts[0].issues.some((i) => i.includes('more than one account')))
  assert.equal(drafts[0].date, '2026-11-13')
  assert.ok(drafts[0].issues.some((i) => i.includes("hasn't happened")))

  assert.equal(drafts[1].holdingId, null)
  assert.ok(drafts[1].issues.some((i) => i.includes('to sell')))

  assert.equal(drafts[2].toAccountId, null)
  assert.ok(drafts[2].issues.some((i) => i.includes('"Dana"')))

  assert.ok(drafts[3].issues.some((i) => i.includes('an amount')))
  assert.ok(drafts[3].issues.some((i) => i.includes('tell the date')))
})

test('smart entry: buying more of a holding the person already has points at that holding', async () => {
  const { as, user } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const holding = (await as.post('/investments').send({ assetName: 'Bank Central Asia', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 900000, price: 9000 })).body.holding

  const fake = async () => ({ actions: [{ kind: 'buy', assetName: 'bank central', quantity: 200, price: 9500 }] })
  const { drafts } = await smartEntry.parse(user.id, 'tambah 200 bank central 9500', { callModel: fake, now: NOW })
  assert.equal(drafts[0].holdingId, holding.id)
  assert.equal(drafts[0].assetName, 'Bank Central Asia')
  assert.equal(drafts[0].total, 1900000)
})

test('smart entry: empty or oversized text is rejected, and nothing is saved by reading', async () => {
  const { as, user } = await createTestUser()
  await assert.rejects(smartEntry.parse(user.id, '   ', { callModel: async () => ({ actions: [] }) }), /Tell us what happened/)
  await assert.rejects(smartEntry.parse(user.id, 'x'.repeat(smartEntry.MAX_TEXT + 1), { callModel: async () => ({ actions: [] }) }), /keep it under/)

  await smartEntry.parse(user.id, 'beli kopi 25rb', { callModel: async () => ({ actions: [{ kind: 'transaction', txType: 'expense', amount: 25000 }] }), now: NOW })
  const list = await as.get('/transactions')
  assert.equal(list.body.transactions.length, 0)
})

test('smart entry: the rate limit stops a flood of requests', () => {
  const start = Date.now()
  for (let i = 0; i < 6; i++) smartEntry.checkRateLimit(987654321, start)
  assert.throws(() => smartEntry.checkRateLimit(987654321, start + 1000), /wait a moment/)
  // A minute later the short limit has cleared.
  assert.doesNotThrow(() => smartEntry.checkRateLimit(987654321, start + 61000))
})

test('smart entry: the endpoint needs a login, and says so plainly when the AI is not set up', async () => {
  const { as } = await createTestUser()
  const saved = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    const res = await as.post('/smart-entry/parse').send({ text: 'beli kopi 25rb' })
    assert.equal(res.status, 503)
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved
  }
})
