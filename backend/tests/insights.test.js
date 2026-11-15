'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')
const periods = require('../shared/periods')

after(async () => {
  await cleanupTestUsers()
})

test('insights: a new user gets a welcome message', async () => {
  const { as } = await createTestUser()
  const res = await as.get('/insights')
  assert.equal(res.status, 200)
  assert.equal(res.body.source, 'starter')
  assert.equal(res.body.items.length, 1)
})

test('insights: a budget that is over its limit is flagged first, with a link to Budgets', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Main', type: 'bank', currency: 'IDR', balance: 10000000 })).body.account
  const category = (await as.get('/categories')).body.categories[0]
  const period = periods.periodKeyForDate(1, new Date())
  await as.post('/budgets').send({ categoryId: category.id, period, limitAmount: 100000, currency: 'IDR' })
  await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 250000, categoryId: category.id })

  const res = await as.get('/insights')
  assert.equal(res.status, 200)
  assert.equal(res.body.source, 'rule_based')
  const over = res.body.items.find((item) => item.id.startsWith('budget-over-'))
  assert.ok(over, 'expected an over-budget finding')
  assert.equal(over.tone, 'warning')
  assert.equal(over.href, '/budgets')
  assert.equal(res.body.items[0].tone, 'warning')
  assert.equal(res.body.insights.length, res.body.items.length)
})

const dayInMonth = (monthsAgo, day) => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - monthsAgo, day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('insights: a repeating charge and an unusually big purchase are pointed out in plain words', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Main', type: 'bank', currency: 'IDR', balance: 50000000 })).body.account
  const category = (await as.get('/categories')).body.categories[0]
  const spend = (amount, occurredAt, extra = {}) => as.post('/transactions').send({ accountId: account.id, type: 'expense', amount, occurredAt, categoryId: category.id, ...extra })

  // The same subscription in three different cycles.
  for (const monthsAgo of [2, 1, 0]) await spend(186000, dayInMonth(monthsAgo, 1), { notes: 'Netflix' })
  // Small everyday purchases in earlier cycles, then one much bigger one now.
  for (const monthsAgo of [3, 2, 1]) {
    await spend(20000, dayInMonth(monthsAgo, 3))
    await spend(22000, dayInMonth(monthsAgo, 4))
  }
  await spend(400000, dayInMonth(0, 1), { notes: 'Weekend shopping' })

  const res = await as.get('/insights')
  assert.equal(res.status, 200)
  const recurring = res.body.items.find((i) => i.id.startsWith('recurring-'))
  assert.ok(recurring, 'expected a repeating-charge finding')
  assert.ok(recurring.title.includes('Netflix'))
  const unusual = res.body.items.find((i) => i.id.startsWith('unusual-'))
  assert.ok(unusual, 'expected an unusual-purchase finding')
  assert.ok(unusual.text.includes('Weekend shopping'))
  assert.equal(typeof res.body.headline, 'string')
})

test('insights: the personal summary is off until switched on, then only rephrases the findings', async () => {
  const { as, user } = await createTestUser()
  const off = await as.get('/insights/summary')
  assert.equal(off.body.enabled, false)
  assert.equal(off.body.summary, null)

  const on = await as.put('/insights/preferences').send({ aiSummary: true })
  assert.equal(on.status, 200)
  assert.equal(on.body.aiSummary, true)
  assert.equal((await as.get('/insights/config')).body.aiSummary, true)
  // The old provider settings are gone: nothing can switch the findings to an outside service.
  assert.equal((await as.put('/insights/config').send({ activeProvider: 'external_ai', providerConfig: { apiKey: 'x', apiUrl: 'http://127.0.0.1' } })).status, 404)

  const insightSummary = require('../services/insightSummary')
  const items = [{ tone: 'warning', title: 'Dining is running high', text: 'You have spent Rp 500.000 on Dining.' }]
  let calls = 0
  const fake = async ({ text }) => {
    calls += 1
    assert.ok(text.includes('Dining is running high'))
    return { summary: 'Dining needs a look first.' }
  }
  assert.equal(await insightSummary.summarize(user.id, items, { callModel: fake }), 'Dining needs a look first.')
  // The same findings are answered from memory, not asked again.
  assert.equal(await insightSummary.summarize(user.id, items, { callModel: fake }), 'Dining needs a look first.')
  assert.equal(calls, 1)
  // Nothing worth saying: the model is not asked at all.
  assert.equal(await insightSummary.summarize(user.id, [{ tone: 'info', title: null, text: 'Welcome' }], { callModel: fake }), null)
})
