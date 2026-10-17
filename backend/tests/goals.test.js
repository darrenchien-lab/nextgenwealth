'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const findGoal = async (as, id) => (await as.get('/goals')).body.goals.find((g) => g.id === id)

test('goals: a goal linked to an account follows its balance, and can take only part of it', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const savings = (await as.post('/accounts').send({ name: 'Savings', type: 'bank', currency: 'IDR', balance: 10000000 })).body.account

  const whole = (await as.post('/goals').send({ name: 'Emergency fund', targetAmount: 20000000, sources: [{ type: 'account', id: savings.id }] })).body.goal
  const part = (await as.post('/goals').send({ name: 'Holiday', targetAmount: 5000000, sources: [{ type: 'account', id: savings.id, amount: 4000000 }] })).body.goal

  let goal = await findGoal(as, whole.id)
  assert.equal(goal.mode, 'linked')
  assert.equal(goal.currency, 'IDR')
  assert.equal(goal.saved_amount, 10000000)
  assert.equal(goal.progressPercentage, 50)
  assert.equal(goal.sources[0].name, 'Savings')
  assert.equal((await findGoal(as, part.id)).saved_amount, 4000000)

  // The balance moves, the goals follow.
  await as.post('/transactions').send({ accountId: savings.id, type: 'expense', amount: 7000000 })
  goal = await findGoal(as, whole.id)
  assert.equal(goal.saved_amount, 3000000)
  assert.equal((await findGoal(as, part.id)).saved_amount, 3000000)

  // Linked goals aren't topped up by hand.
  assert.equal((await as.post(`/goals/${whole.id}/contribute`).send({ amount: 1000 })).status, 400)
})

test('goals: a holding can fund a goal, and goals can be edited, including back to hand-tracked', async () => {
  const { as } = await createTestUser()
  const other = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const holding = (await as.post('/investments').send({ assetName: 'RDPU', assetType: 'mutual_fund', quantity: 1000, currency: 'IDR', totalSpent: 1500000, price: 1500 })).body.holding

  const goal = (await as.post('/goals').send({ name: 'Fund', targetAmount: 3000000, sources: [{ type: 'holding', id: holding.id }] })).body.goal
  assert.equal((await findGoal(as, goal.id)).saved_amount, 1500000)

  const edited = await as.patch(`/goals/${goal.id}`).send({ name: 'Rainy day', targetAmount: 2000000, sources: [] })
  assert.equal(edited.status, 200)
  const manual = await findGoal(as, goal.id)
  assert.equal(manual.name, 'Rainy day')
  assert.equal(manual.mode, 'manual')
  assert.equal(manual.saved_amount, 0)
  assert.equal((await as.post(`/goals/${goal.id}/contribute`).send({ amount: 500000 })).status, 200)

  // Someone else's goal, or someone else's account as a source, isn't found.
  assert.equal((await other.as.patch(`/goals/${goal.id}`).send({ name: 'x', targetAmount: 1 })).status, 404)
  const othersAccount = (await other.as.post('/accounts').send({ name: 'Theirs', type: 'bank', currency: 'IDR', balance: 1 })).body.account
  assert.equal((await as.post('/goals').send({ name: 'Bad', targetAmount: 1, sources: [{ type: 'account', id: othersAccount.id }] })).status, 404)
})

test('goals: the plan shows what is needed per month, the recent pace, and whether the goal is on track', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const goal = (await as.post('/goals').send({ name: 'Laptop', targetAmount: 12000000, targetDate: daysFromNow(182) })).body.goal
  await as.post(`/goals/${goal.id}/contribute`).send({ amount: 3000000, date: daysFromNow(-60) })
  await as.post(`/goals/${goal.id}/contribute`).send({ amount: 3000000, date: daysFromNow(-30) })

  const { plan } = await findGoal(as, goal.id)
  assert.equal(plan.remaining, 6000000)
  // 6,000,000 left over about 6 months ≈ 1,000,000 a month; saving about
  // 1,500,000 a month lately (3,000,000 over the last 60 days).
  assert.ok(plan.neededPerMonth > 990000 && plan.neededPerMonth < 1020000, `needed ${plan.neededPerMonth}`)
  assert.ok(plan.pacePerMonth > 1500000 && plan.pacePerMonth < 1550000, `pace ${plan.pacePerMonth}`)
  assert.equal(plan.status, 'on_track')
  assert.ok(plan.projectedDate < daysFromNow(182))
})

test('goals: suggestions give the average spending of finished cycles, or nothing without history', async () => {
  const { as } = await createTestUser()
  const res = await as.get('/goals/suggestions')
  assert.equal(res.status, 200)
  assert.equal(res.body.averageMonthlyExpense, null)
})
