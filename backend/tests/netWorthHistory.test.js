'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers, pool } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Saves a flat net worth of 1,000,000 IDR for each of the last `days` days
// (not today), as if the daily snapshot job had been running.
const seedSnapshots = async (userId, days) => {
  for (let n = days; n >= 1; n--) {
    await pool.query(
      `INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, display_currency) VALUES ($1, $2, 1000000, 'IDR')`,
      [userId, daysAgo(n)]
    )
  }
}

const snapshotsByDate = async (userId) => {
  const rows = (await pool.query(
    `SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS date, net_worth FROM net_worth_snapshots WHERE user_id = $1`,
    [userId]
  )).rows
  return Object.fromEntries(rows.map((r) => [r.date, Number(r.net_worth)]))
}

test('net worth history: a backdated transaction corrects the saved history from its date, and editing or deleting it does too', async () => {
  const { user, as } = await createTestUser()
  const other = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 1000000 })).body.account
  await seedSnapshots(user.id, 6)
  await seedSnapshots(other.user.id, 6)

  const created = (await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 50000, occurredAt: daysAgo(3) })).body.transaction
  let history = await snapshotsByDate(user.id)
  assert.equal(history[daysAgo(4)], 1000000) // before the transaction: untouched
  assert.equal(history[daysAgo(3)], 950000)
  assert.equal(history[daysAgo(1)], 950000)

  // Moving it two days earlier and making it smaller.
  await as.patch(`/transactions/${created.id}`).send({ amount: 20000, occurredAt: daysAgo(5) })
  history = await snapshotsByDate(user.id)
  assert.equal(history[daysAgo(6)], 1000000)
  assert.equal(history[daysAgo(5)], 980000)
  assert.equal(history[daysAgo(1)], 980000)

  await as.delete(`/transactions/${created.id}`)
  history = await snapshotsByDate(user.id)
  assert.deepEqual(new Set(Object.entries(history).filter(([d]) => d !== daysAgo(0)).map(([, v]) => v)), new Set([1000000]))

  // Another user's history is never touched.
  const otherHistory = await snapshotsByDate(other.user.id)
  assert.deepEqual(new Set(Object.values(otherHistory)), new Set([1000000]))
})
