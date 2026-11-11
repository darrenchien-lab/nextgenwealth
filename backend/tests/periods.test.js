'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const periods = require('../shared/periods')

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('periods: a start day the month is too short for falls on its last day', () => {
  // Payday on the 31st: which cycle does the 28th of each month fall in?
  // Jan 28 is still in the cycle that began Dec 31; Feb 28 begins one (Feb has
  // no 31st); Mar 28 is in that one; Apr 28 is in the cycle that began Mar 31.
  const starts = [0, 1, 2, 3].map((m) => key(periods.getCurrentPeriodBounds(31, new Date(2026, m, 28)).start))
  assert.deepEqual(starts, ['2025-12-31', '2026-02-28', '2026-02-28', '2026-03-31'])
  assert.equal(key(periods.getCurrentPeriodBounds(31, new Date(2026, 1, 28)).start), '2026-02-28')
  assert.equal(key(periods.getCurrentPeriodBounds(31, new Date(2026, 1, 27)).start), '2026-01-31')
  assert.equal(key(periods.getCurrentPeriodBounds(31, new Date(2026, 3, 30)).start), '2026-04-30')
  assert.equal(key(periods.getCurrentPeriodBounds(30, new Date(2026, 1, 28)).start), '2026-02-28')
  // A leap year has a 29th.
  assert.equal(key(periods.getCurrentPeriodBounds(31, new Date(2028, 1, 29)).start), '2028-02-29')
})

test('periods: every start day gives cycles that follow each other with no gap or overlap', () => {
  for (let day = 1; day <= 31; day++) {
    let { start, end } = periods.getCurrentPeriodBounds(day, new Date(2027, 11, 15))
    for (let i = 0; i < 40; i++) {
      const previous = periods.getPeriodBoundsForOffset(day, i + 1, new Date(2027, 11, 15))
      const current = periods.getPeriodBoundsForOffset(day, i, new Date(2027, 11, 15))
      const dayAfterPrevious = new Date(previous.end.getFullYear(), previous.end.getMonth(), previous.end.getDate() + 1)
      assert.equal(key(dayAfterPrevious), key(current.start), `start day ${day}, ${i} cycles back`)
      assert.ok(current.start < current.end)
      // The 'YYYY-MM' key round-trips to the same cycle.
      const back = periods.periodKeyToBounds(day, periods.periodKeyForDate(day, current.start))
      assert.equal(key(back.start), key(current.start))
      assert.equal(key(back.end), key(current.end))
      ;({ start, end } = current)
    }
    assert.ok(start && end)
  }
})

test('periods: the cycle after the one starting Jan 31 starts on the last day of February', () => {
  assert.equal(key(periods.nextPeriodStart(31, new Date(2026, 0, 31))), '2026-02-28')
  assert.equal(key(periods.nextPeriodStart(31, new Date(2026, 1, 28))), '2026-03-31')
  assert.equal(key(periods.nextPeriodStart(10, new Date(2026, 9, 10))), '2026-11-10')
})

test('periods: the cycle start day can be set to 31, and the pages built on it still work', async () => {
  const { createTestUser, cleanupTestUsers } = require('./helpers')
  const { as } = await createTestUser()
  try {
    assert.equal((await as.put('/accounts/cycle-start-day').send({ cycleStartDay: 31 })).status, 200)
    assert.equal((await as.put('/accounts/cycle-start-day').send({ cycleStartDay: 32 })).status, 400)
    assert.equal((await as.put('/accounts/cycle-start-day').send({ cycleStartDay: 0 })).status, 400)
    assert.equal((await as.get('/accounts/cycle-start-day')).body.cycleStartDay, 31)
    for (const path of ['/reports/dashboard', '/reports/dashboard?periodOffset=1', '/reports/cycle-trend', '/transactions', '/budgets', '/reports/expense-breakdown']) {
      assert.equal((await as.get(path)).status, 200, path)
    }
  } finally {
    await cleanupTestUsers()
  }
})
