'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')
const insightSummary = require('../services/insightSummary')
const smartEntry = require('../services/smartEntry')
const helpAssistant = require('../services/helpAssistant')

after(async () => {
  await cleanupTestUsers()
})

const dayInMonth = (monthsAgo, day) => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - monthsAgo, day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('insights: something bought every day is not called a subscription', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Main', type: 'bank', currency: 'IDR', balance: 50000000 })).body.account
  // "lunch" at about the same price on several days of each of three cycles, and a real subscription once per cycle.
  for (const monthsAgo of [2, 1, 0]) {
    for (const dayOfMonth of [1, 2, 3, 4, 5]) {
      await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 45000, occurredAt: dayInMonth(monthsAgo, dayOfMonth), notes: 'Lunch' })
    }
    await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 120000, occurredAt: dayInMonth(monthsAgo, 1), notes: 'Spotify' })
  }
  const items = (await as.get('/insights')).body.items.filter((i) => i.id.startsWith('recurring-'))
  assert.ok(items.some((i) => i.title.includes('Spotify')), 'the monthly subscription should be found')
  assert.equal(items.some((i) => i.title.includes('Lunch')), false, 'daily lunch is not a subscription')
})

test('insights: the summary never shows words written for older findings, even at the daily limit', async () => {
  const userId = 424242
  const one = [{ tone: 'warning', title: 'Dining is running high', text: 'You have spent Rp 500.000 on Dining.' }]
  const two = [{ tone: 'warning', title: 'Transport is running high', text: 'You have spent Rp 900.000 on Transport.' }]
  let calls = 0
  const fake = async () => { calls += 1; return { summary: `Summary ${calls}` } }
  assert.equal(await insightSummary.summarize(userId, one, { callModel: fake }), 'Summary 1')
  // Use up the rest of the day with other findings.
  for (let i = 0; i < 9; i++) {
    await insightSummary.summarize(userId, [{ tone: 'info', title: `Finding ${i}`, text: 'x' }], { callModel: fake })
  }
  // At the limit: the old summary is not handed back for new findings.
  assert.equal(await insightSummary.summarize(userId, two, { callModel: fake }), null)
  // A failing call doesn't use up a try.
  const failing = async () => { throw new Error('down') }
  await assert.rejects(insightSummary.summarize(777, one, { callModel: failing }), /down/)
  assert.equal(await insightSummary.summarize(777, one, { callModel: fake }), `Summary ${calls}`)
})

test('AI entry and Help: a call that fails on our side does not use up one of the person\'s tries', async () => {
  const { user } = await createTestUser()
  const failing = async () => { throw new Error('down') }
  for (let i = 0; i < 10; i++) {
    await assert.rejects(helpAssistant.ask(user.id, 'How do I add a bill?', [], { callModel: failing }), /down/)
  }
  // Ten failures in a row would have hit the per-minute limit of 8 if they had counted.
  const ok = await helpAssistant.ask(user.id, 'How do I add a bill?', [], { callModel: async () => ({ answer: 'Open Bills.' }) })
  assert.equal(ok.answer, 'Open Bills.')

  for (let i = 0; i < 10; i++) {
    await assert.rejects(smartEntry.parse(user.id, 'lunch 45k', { callModel: failing }), /down/)
  }
  const parsed = await smartEntry.parse(user.id, 'lunch 45k', { callModel: async () => ({ actions: [] }) })
  assert.deepEqual(parsed.drafts, [])
})
