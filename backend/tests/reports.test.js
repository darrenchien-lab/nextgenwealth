'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers, pool } = require('./helpers')
const periods = require('../shared/periods')

// A currency no other test uses, so its made-up rate history can't affect them.
const TEST_CURRENCY = 'ISK'

after(async () => {
  await pool.query('DELETE FROM exchange_rates WHERE quote_currency = $1', [TEST_CURRENCY])
  await cleanupTestUsers()
})

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('reports: two budget cycles compared side by side, by category', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 5000000 })).body.account
  const food = (await as.post('/categories').send({ name: 'Food', type: 'expense' })).body.category
  const fun = (await as.post('/categories').send({ name: 'Fun', type: 'expense' })).body.category

  const previousStart = periods.getPeriodBoundsForOffset(1, 1).start
  await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 100000, categoryId: food.id, occurredAt: dayKey(previousStart) })
  await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 50000, categoryId: fun.id, occurredAt: dayKey(previousStart) })
  await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 150000, categoryId: food.id })

  const res = (await as.get('/reports/compare-cycles')).body
  assert.equal(res.a.expense, 150000)
  assert.equal(res.b.expense, 150000)
  assert.equal(res.options.length, 12)
  const byName = Object.fromEntries(res.categories.map((c) => [c.categoryName, c]))
  assert.deepEqual([byName.Food.a, byName.Food.b, byName.Food.change, byName.Food.changePercentage], [150000, 100000, 50000, 50])
  assert.deepEqual([byName.Fun.a, byName.Fun.b, byName.Fun.changePercentage], [0, 50000, -100])

  assert.equal((await as.get('/reports/compare-cycles?a=2026-13')).status, 400)
})

test('reports: currency exposure, and how much rate moves since the cycle began changed it', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'USD' })
  await as.post('/accounts').send({ name: 'Dollars', type: 'bank', currency: 'USD', balance: 30 })
  await as.post('/accounts').send({ name: 'Krona', type: 'bank', currency: TEST_CURRENCY, balance: 1000 })

  // 100 per dollar when the cycle began, 125 now: 1000 went from 10 to 8 dollars.
  const cycleStart = periods.getPeriodBoundsForOffset(1, 0).start
  const before = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate() - 40)
  await pool.query(
    `INSERT INTO exchange_rates (base_currency, quote_currency, rate, fetched_at) VALUES ('USD', $1, 100, $2), ('USD', $1, 100, $3), ('USD', $1, 125, NOW())`,
    [TEST_CURRENCY, `${dayKey(before)}T12:00:00`, `${dayKey(cycleStart)}T00:30:00`]
  )

  const res = (await as.get('/reports/currency-exposure')).body
  const byCurrency = Object.fromEntries(res.exposure.map((e) => [e.currency, e]))
  assert.equal(byCurrency.USD.value, 30)
  assert.equal(byCurrency[TEST_CURRENCY].amount, 1000)
  assert.equal(byCurrency[TEST_CURRENCY].value, 8)
  assert.equal(res.total, 38)
  assert.equal(byCurrency.USD.percentage, 78.9)

  assert.equal(res.since.offset, 0)
  const krona = res.fxImpact.byCurrency.find((c) => c.currency === TEST_CURRENCY)
  assert.equal(krona.impact, -2)
  assert.equal(krona.rateChangePercentage, -20)
  assert.equal(res.fxImpact.total, -2)
})

test('reports: the export is a PDF for this or the last cycle, and Excel is no longer offered', async () => {
  const { as } = await createTestUser()
  const pdf = await as.get('/reports/export?format=pdf').buffer(true).parse((res, cb) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => cb(null, Buffer.concat(chunks)))
  })
  assert.equal(pdf.status, 200)
  assert.equal(pdf.headers['content-type'], 'application/pdf')
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF')
  assert.equal((await as.get('/reports/export?format=pdf&periodOffset=1')).status, 200)
  assert.equal((await as.get('/reports/export?format=excel')).status, 400)
})
