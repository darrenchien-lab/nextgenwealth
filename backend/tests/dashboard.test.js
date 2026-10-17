'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers, pool } = require('./helpers')
const periods = require('../shared/periods')

after(async () => {
  await cleanupTestUsers()
})

const localDateTime = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T12:00:00`

test('dashboard: an empty new cycle shows no change, and savings rate changes in percentage points', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 0 })).body.account

  // Last cycle: income 1,000,000, expense 522,000 → savings rate 47.8%.
  const lastCycleDay = periods.getPeriodBoundsForOffset(1, 1).start
  await as.post('/transactions').send({ accountId: account.id, type: 'income', amount: 1000000, occurredAt: localDateTime(lastCycleDay) })
  await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 522000, occurredAt: localDateTime(lastCycleDay) })

  let summary = (await as.get('/reports/dashboard')).body
  assert.equal(summary.income, 0)
  assert.equal(summary.savingsRate, null)
  assert.equal(summary.changes.income, null)
  assert.equal(summary.changes.expense, null)
  assert.equal(summary.changes.savingsRate, null)

  // A small cashback alone this cycle: savings rate 100%, i.e. +52.2 points — not +109%.
  await as.post('/transactions').send({ accountId: account.id, type: 'income', amount: 9000 })
  summary = (await as.get('/reports/dashboard')).body
  assert.equal(summary.savingsRate, 100)
  assert.equal(summary.changes.savingsRate, 52.2)
})

test('dashboard: a salary paid just before the cycle starts can count in the new cycle, while keeping its real date', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 0 })).body.account

  // The last day of the previous cycle.
  const currentStart = periods.getPeriodBoundsForOffset(1, 0).start
  const dayBefore = new Date(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate() - 1)
  const dayBeforeKey = `${dayBefore.getFullYear()}-${String(dayBefore.getMonth() + 1).padStart(2, '0')}-${String(dayBefore.getDate()).padStart(2, '0')}`

  const salary = (await as.post('/transactions').send({
    accountId: account.id, type: 'income', amount: 5000000, occurredAt: dayBeforeKey, countInNextCycle: true
  })).body.transaction
  assert.ok(salary.cycle_date)

  const current = (await as.get('/reports/dashboard')).body
  const previous = (await as.get('/reports/dashboard?periodOffset=1')).body
  assert.equal(current.income, 5000000)
  assert.equal(previous.income, 0)

  // The account statement still shows it on the day the money arrived.
  const statement = (await as.get(`/accounts/${account.id}/statement`)).body
  const entry = statement.entries.find((e) => e.id === salary.id)
  const d = new Date(entry.occurredAt)
  assert.equal(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, dayBeforeKey)

  // Turning it off puts it back in the cycle its date falls in.
  await as.patch(`/transactions/${salary.id}`).send({ countInNextCycle: false })
  assert.equal((await as.get('/reports/dashboard')).body.income, 0)
  assert.equal((await as.get('/reports/dashboard?periodOffset=1')).body.income, 5000000)
})

test('dashboard: net worth change compares by budget cycle, so an early salary counts toward the cycle it is for', async () => {
  const { user, as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 10000000 })).body.account

  // A flat 10,000,000 every day from before the previous cycle up to yesterday.
  const previousStart = periods.getPeriodBoundsForOffset(1, 1).start
  const today = new Date()
  for (let d = new Date(previousStart.getFullYear(), previousStart.getMonth(), previousStart.getDate() - 2); d < new Date(today.getFullYear(), today.getMonth(), today.getDate()); d.setDate(d.getDate() + 1)) {
    await pool.query(
      `INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, display_currency) VALUES ($1, $2, 10000000, 'IDR')`,
      [user.id, localDateTime(d).slice(0, 10)]
    )
  }

  // Salary arrives the day before the current cycle, counted in the current one.
  const currentStart = periods.getPeriodBoundsForOffset(1, 0).start
  const dayBefore = new Date(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate() - 1)
  await as.post('/transactions').send({
    accountId: account.id, type: 'income', amount: 5000000, occurredAt: localDateTime(dayBefore).slice(0, 10), countInNextCycle: true
  })

  const current = (await as.get('/reports/dashboard')).body
  const previous = (await as.get('/reports/dashboard?periodOffset=1')).body
  // The salary belongs to the cycle it was for, in both the figure and its change.
  assert.equal(current.netWorth, 15000000)
  assert.equal(previous.netWorth, 10000000)
  assert.equal(current.changes.netWorth, 50)
  assert.equal(previous.changes.netWorth, 0)
})

test('dashboard: last cycle asset allocation uses balances as of that cycle end, not today', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const bank = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 1000000 })).body.account
  const wallet = (await as.post('/accounts').send({ name: 'Wallet', type: 'e_wallet', currency: 'IDR', balance: 0 })).body.account

  // Opened before the previous cycle ended, as if they had existed then.
  const previousStart = periods.getPeriodBoundsForOffset(1, 1).start
  await pool.query('UPDATE accounts SET created_at = $1 WHERE id IN ($2, $3)', [previousStart, bank.id, wallet.id])

  // Moved to the wallet this cycle: now 50/50, but last cycle was all bank.
  await as.post('/transfers').send({ fromAccountId: bank.id, toAccountId: wallet.id, amount: 500000 })

  const now = (await as.get('/reports/asset-allocation')).body
  const last = (await as.get('/reports/asset-allocation?periodOffset=1')).body
  assert.deepEqual(now.allocation.map((a) => [a.type, a.percentage]).sort(), [['bank', 50], ['e_wallet', 50]])
  assert.deepEqual(last.allocation.map((a) => [a.type, a.percentage]), [['bank', 100]])
  assert.ok(last.asOf)
})

test('target allocation: actual is compared with a past cycle end, offered only back to when history starts', async () => {
  const { user, as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const bank = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 1000000 })).body.account
  const wallet = (await as.post('/accounts').send({ name: 'Broker Cash', type: 'e_wallet', currency: 'IDR', balance: 0 })).body.account
  await as.put('/investments/allocation-targets').send({ targets: [{ assetName: 'Bank', targetPercentage: 0 }, { assetName: 'e_wallet', targetPercentage: 100 }] })

  // Nothing saved before today yet: nothing to compare with.
  let res = (await as.get('/investments/allocation-targets')).body
  assert.deepEqual(res.compareOptions, [])
  assert.equal(res.comparison[0].previousPercentage, null)

  // Accounts and history going back to the start of the previous cycle.
  const previousStart = periods.getPeriodBoundsForOffset(1, 1).start
  await pool.query('UPDATE accounts SET created_at = $1 WHERE id IN ($2, $3)', [previousStart, bank.id, wallet.id])
  await pool.query(
    `INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, display_currency) VALUES ($1, $2, 1000000, 'IDR')`,
    [user.id, localDateTime(previousStart).slice(0, 10)]
  )
  await as.post('/transfers').send({ fromAccountId: bank.id, toAccountId: wallet.id, amount: 500000 })

  res = (await as.get('/investments/allocation-targets?compareOffset=1')).body
  assert.equal(res.compareOptions.length, 1)
  assert.equal(res.compareWith.offset, 1)
  const byName = Object.fromEntries(res.comparison.map((c) => [c.assetName, c]))
  assert.equal(byName.Bank.actualPercentage, 50)
  assert.equal(byName.Bank.previousPercentage, 100)
  assert.equal(byName.e_wallet.previousPercentage, 0)
})

test('target allocation: a buy after the last saved holding value still counts at the past cycle end', async () => {
  const { user, as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const broker = (await as.post('/accounts').send({ name: 'Broker Cash', type: 'e_wallet', currency: 'IDR', balance: 1000000 })).body.account
  const holding = (await as.post('/investments').send({ assetName: 'BBCA', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 100000, price: 1000 })).body.holding
  await as.patch(`/investments/${holding.id}/category`).send({ category: 'Equity' })
  await as.put('/investments/allocation-targets').send({ targets: [{ assetName: 'Equity', targetPercentage: 50 }, { assetName: 'e_wallet', targetPercentage: 50 }] })

  const previousStart = periods.getPeriodBoundsForOffset(1, 1).start
  await pool.query('UPDATE accounts SET created_at = $1 WHERE id = $2', [previousStart, broker.id])
  await pool.query(
    `INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, display_currency) VALUES ($1, $2, 1000000, 'IDR')`,
    [user.id, localDateTime(previousStart).slice(0, 10)]
  )

  // Bought 200 more on the last day of the previous cycle, a day with no saved portfolio value.
  const lastDay = periods.getPeriodBoundsForOffset(1, 1).end
  const add = await as.post(`/investments/${holding.id}/add`).send({ quantity: 200, totalSpent: 200000, accountId: broker.id, date: localDateTime(lastDay).slice(0, 10) })
  assert.equal(add.status, 200)

  const res = (await as.get('/investments/allocation-targets?compareOffset=1')).body
  const byName = Object.fromEntries(res.comparison.map((c) => [c.assetName, c]))
  // Then: 800,000 cash and 200 shares worth 200,000 (the 100 bought today didn't exist yet).
  assert.equal(byName.Equity.previousPercentage, 20)
  assert.equal(byName.e_wallet.previousPercentage, 80)
})

test('dashboard: the cycle trend runs day by day through the cycle, and the breakdown can show the previous cycle', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Bank', type: 'bank', currency: 'IDR', balance: 0 })).body.account
  const category = (await as.post('/categories').send({ name: 'Food', type: 'expense' })).body.category

  const currentStart = periods.getPeriodBoundsForOffset(1, 0).start
  const previousStart = periods.getPeriodBoundsForOffset(1, 1).start
  const dayKey = (d) => localDateTime(d).slice(0, 10)
  await as.post('/transactions').send({ accountId: account.id, type: 'income', amount: 1000000, occurredAt: dayKey(currentStart) })
  await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 200000, categoryId: category.id })
  await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 50000, categoryId: category.id, occurredAt: dayKey(previousStart) })

  const trend = (await as.get('/reports/cycle-trend')).body
  assert.equal(trend.days[0].date, dayKey(currentStart))
  assert.equal(trend.days[0].income, 1000000)
  const today = trend.days[trend.days.length - 1]
  assert.equal(today.date, dayKey(new Date()))
  assert.deepEqual([today.income, today.expense, today.net], [1000000, 200000, 800000])

  const previous = (await as.get('/reports/expense-breakdown?periodOffset=1')).body
  assert.equal(previous.total, 50000)
  assert.equal(previous.breakdown[0].categoryName, 'Food')
  assert.match(previous.period, /^\d{4}-\d{2}$/)
})
