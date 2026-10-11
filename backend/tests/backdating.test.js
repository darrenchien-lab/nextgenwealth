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
const localDay = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const newAccount = async (as, name, balance) => (
  (await as.post('/accounts').send({ name, type: 'bank', currency: 'IDR', balance })).body.account
)

test('backdating: a transfer can be dated earlier, a future date is refused, and the backdated one has no balance-after', async () => {
  const { as } = await createTestUser()
  const from = await newAccount(as, 'From', 1000000)
  const to = await newAccount(as, 'To', 0)

  const res = await as.post('/transfers').send({ fromAccountId: from.id, toAccountId: to.id, amount: 100000, occurredAt: daysAgo(4) })
  assert.equal(res.status, 201)
  assert.equal(localDay(res.body.transfer.occurred_at), daysAgo(4))
  assert.equal(res.body.transfer.from_balance_after, null)

  const future = await as.post('/transfers').send({ fromAccountId: from.id, toAccountId: to.id, amount: 1, occurredAt: '2999-01-01' })
  assert.equal(future.status, 400)
})

test('backdating: a bill can be paid on an earlier date, and the payment transaction carries that date', async () => {
  const { as } = await createTestUser()
  const account = await newAccount(as, 'Bank', 1000000)
  const bill = (await as.post('/bills').send({ name: 'Internet', amount: 300000, dueDate: daysAgo(5), accountId: account.id })).body.bill

  const res = await as.post(`/bills/${bill.id}/pay`).send({ paidOn: daysAgo(3) })
  assert.equal(res.status, 200)

  const payment = (await pool.query('SELECT occurred_at, amount FROM transactions WHERE bill_id = $1', [bill.id])).rows[0]
  assert.equal(localDay(payment.occurred_at), daysAgo(3))
  assert.equal(Number(payment.amount), 300000)
})

test('backdating: a balance correction dated earlier keeps reconciliation and the statement consistent', async () => {
  const { as } = await createTestUser()
  const account = await newAccount(as, 'Bank', 1000000)
  await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 100000, occurredAt: daysAgo(2) })

  // A difference that really arose 5 days ago, recorded today.
  const res = await as.patch(`/accounts/${account.id}/adjust`).send({ delta: -50000, date: daysAgo(5) })
  assert.equal(res.status, 200)
  assert.equal(Number(res.body.account.balance), 850000)

  const reconcile = (await as.post('/accounts/reconcile')).body
  assert.equal(reconcile.mismatches.length, 0)

  const statement = (await as.get(`/accounts/${account.id}/statement`)).body
  assert.equal(statement.consistent, true)
  assert.deepEqual(statement.entries.map((e) => [e.source, localDay(e.occurredAt), e.balanceAfter]), [
    ['adjustment', daysAgo(5), 950000],
    ['transaction', daysAgo(2), 850000]
  ])
})

test('backdating: goal contributions and withdrawals keep the date they really happened', async () => {
  const { as } = await createTestUser()
  const goal = (await as.post('/goals').send({ name: 'Trip', targetAmount: 1000000 })).body.goal
  await as.post(`/goals/${goal.id}/contribute`).send({ amount: 200000, date: daysAgo(6) })
  await as.post(`/goals/${goal.id}/withdraw`).send({ amount: 50000, date: daysAgo(2) })

  const rows = (await pool.query('SELECT amount, occurred_at FROM goal_contributions WHERE goal_id = $1 ORDER BY occurred_at', [goal.id])).rows
  assert.deepEqual(rows.map((r) => [Number(r.amount), localDay(r.occurred_at)]), [[200000, daysAgo(6)], [-50000, daysAgo(2)]])
})

test('backdating: a backdated investment buy corrects the saved net worth and portfolio history from its date', async () => {
  const { user, as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = await newAccount(as, 'Broker cash', 5000000)
  for (let n = 5; n >= 1; n--) {
    await pool.query(`INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, display_currency) VALUES ($1, $2, 5000000, 'IDR')`, [user.id, daysAgo(n)])
    await pool.query(`INSERT INTO investment_snapshots (user_id, snapshot_date, total_value, total_cost_basis, display_currency) VALUES ($1, $2, 0, 0, 'IDR')`, [user.id, daysAgo(n)])
  }

  // 100 units at 10,000 plus a 1,500 fee, paid from the account 3 days ago.
  const holding = (await as.post('/investments').send({
    assetName: 'BACK', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 1001500, price: 10000, purchasedAt: daysAgo(3), accountId: account.id
  })).body.holding

  const byDate = async (sql) => Object.fromEntries((await pool.query(sql, [user.id])).rows.map((r) => [r.date, r]))
  const netWorth = await byDate(`SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS date, net_worth FROM net_worth_snapshots WHERE user_id = $1`)
  assert.equal(Number(netWorth[daysAgo(4)].net_worth), 5000000) // before the buy
  assert.equal(Number(netWorth[daysAgo(3)].net_worth), 4998500) // cash out, units in: only the fee is lost
  assert.equal(Number(netWorth[daysAgo(1)].net_worth), 4998500)

  const portfolio = await byDate(`SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS date, total_value, total_cost_basis FROM investment_snapshots WHERE user_id = $1`)
  assert.equal(Number(portfolio[daysAgo(4)].total_value), 0)
  assert.equal(Number(portfolio[daysAgo(3)].total_value), 1000000)
  assert.equal(Number(portfolio[daysAgo(3)].total_cost_basis), 1001500)

  const holdingDays = (await pool.query(`SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS date FROM investment_holding_snapshots WHERE holding_id = $1 AND snapshot_date < CURRENT_DATE ORDER BY snapshot_date`, [holding.id])).rows.map((r) => r.date)
  assert.deepEqual(holdingDays, [daysAgo(3), daysAgo(2), daysAgo(1)])
})
