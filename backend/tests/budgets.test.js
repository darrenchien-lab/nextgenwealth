'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')
const periods = require('../shared/periods')

after(async () => {
  await cleanupTestUsers()
})

test('budgets: the list defaults to the current budget cycle, not the calendar month', async () => {
  const { as } = await createTestUser()

  // A late cutoff day makes "now" fall in the previous month's cycle for
  // most of each month — exactly where a calendar-month default goes wrong.
  const cycleStartDay = 25
  await as.put('/accounts/cycle-start-day').send({ cycleStartDay })
  const expectedPeriod = periods.periodKeyForDate(cycleStartDay, new Date())

  const category = (await as.get('/categories')).body.categories[0]
  await as.post('/budgets').send({ categoryId: category.id, period: expectedPeriod, limitAmount: 1000000, currency: 'IDR' })

  const res = await as.get('/budgets')
  assert.equal(res.status, 200)
  assert.equal(res.body.period, expectedPeriod)
  assert.ok(res.body.periodLabel)
  assert.equal(res.body.budgets.length, 1)
})
