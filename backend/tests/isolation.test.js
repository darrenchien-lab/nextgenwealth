'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers, request, app } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const inDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Everything one person owns, so another can be pointed at each piece.
const seedOwner = async (as) => {
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Mine', type: 'bank', currency: 'IDR', balance: 1000000 })).body.account
  const second = (await as.post('/accounts').send({ name: 'Mine 2', type: 'bank', currency: 'IDR', balance: 500000 })).body.account
  const category = (await as.post('/categories').send({ name: 'Private category' })).body.category
  const txn = (await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 10000, categoryId: category.id })).body.transaction
  const transfer = (await as.post('/transfers').send({ fromAccountId: account.id, toAccountId: second.id, amount: 5000 })).body.transfer
  const budget = (await as.post('/budgets').send({ categoryId: category.id, period: '2026-11', limitAmount: 100000, currency: 'IDR' })).body.budget
  const bill = (await as.post('/bills').send({ name: 'Rent', amount: 20000, dueDate: inDays(5), accountId: account.id })).body.bill
  const goal = (await as.post('/goals').send({ name: 'Trip', targetAmount: 1000000 })).body.goal
  const holding = (await as.post('/investments').send({ assetName: 'SECRET', assetType: 'stock', quantity: 10, currency: 'IDR', totalSpent: 100000, price: 10000 })).body.holding
  for (const [name, value] of Object.entries({ account, second, category, txn, transfer, budget, bill, goal, holding })) {
    assert.ok(value && value.id, `seeding ${name} failed`)
  }
  return { account, second, category, txn, transfer, budget, bill, goal, holding }
}

const balanceOf = async (as, id) => Number((await as.get('/accounts')).body.accounts.find((a) => a.id === id).balance)

test('isolation: nobody can read or change another person\'s records by guessing ids', async () => {
  const owner = await createTestUser()
  const other = await createTestUser()
  const mine = await seedOwner(owner.as)
  const before = await balanceOf(owner.as, mine.account.id)

  const attempts = [
    ['get', `/accounts/${mine.account.id}/statement`],
    ['patch', `/accounts/${mine.account.id}/adjust`, { delta: 1 }],
    ['post', `/accounts/${mine.account.id}/archive`],
    ['post', `/accounts/${mine.account.id}/unarchive`],
    ['delete', `/accounts/${mine.account.id}`],
    ['patch', `/transactions/${mine.txn.id}`, { amount: 1 }],
    ['delete', `/transactions/${mine.txn.id}`],
    ['post', `/transactions/${mine.txn.id}/split`, { splits: [{ amount: 5000 }, { amount: 5000 }] }],
    ['post', `/transfers/${mine.transfer.id}/reverse`],
    ['get', `/budgets/${mine.budget.id}/forecast`],
    ['patch', `/budgets/${mine.budget.id}`, { limitAmount: 1 }],
    ['delete', `/budgets/${mine.budget.id}`],
    ['patch', `/bills/${mine.bill.id}`, { amount: 1 }],
    ['post', `/bills/${mine.bill.id}/pay`],
    ['post', `/bills/${mine.bill.id}/cancel`],
    ['delete', `/bills/${mine.bill.id}`],
    ['patch', `/goals/${mine.goal.id}`, { name: 'Stolen' }],
    ['post', `/goals/${mine.goal.id}/contribute`, { amount: 100 }],
    ['post', `/goals/${mine.goal.id}/withdraw`, { amount: 100 }],
    ['delete', `/goals/${mine.goal.id}`],
    ['get', `/investments/${mine.holding.id}/price-history`],
    ['put', `/investments/${mine.holding.id}/price-source`, { source: 'yahoo', symbol: 'AAPL' }],
    ['delete', `/investments/${mine.holding.id}/price-source`],
    ['get', `/investments/${mine.holding.id}/detail`],
    ['patch', `/investments/${mine.holding.id}/price`, { currentPrice: 1 }],
    ['patch', `/investments/${mine.holding.id}/name`, { assetName: 'Stolen' }],
    ['patch', `/investments/${mine.holding.id}/category`, { category: 'Stolen' }],
    ['patch', `/investments/${mine.holding.id}/purchased-at`, { purchasedAt: '2026-01-01' }],
    ['post', `/investments/${mine.holding.id}/add`, { quantity: 1, price: 1, totalSpent: 1 }],
    ['post', `/investments/${mine.holding.id}/remove`, { quantity: 1, price: 1 }]
  ]
  for (const [method, path, body] of attempts) {
    const req = other.as[method](path)
    const res = await (body ? req.send(body) : req)
    assert.equal(res.status, 404, `${method.toUpperCase()} ${path} answered ${res.status} to the wrong person (expected 404)`)
    assert.equal(JSON.stringify(res.body).includes('SECRET'), false, `${method.toUpperCase()} ${path} leaked a name`)
  }

  // Nothing of the owner's moved.
  assert.equal(await balanceOf(owner.as, mine.account.id), before)
  assert.equal((await owner.as.get('/transactions')).body.transactions.length, 1)
  assert.equal((await owner.as.get('/goals')).body.goals[0].name, 'Trip')
  assert.equal((await owner.as.get('/investments/portfolio')).body.holdings[0].asset_name, 'SECRET')
  assert.equal((await owner.as.get('/bills')).body.bills[0].status, 'pending')
  assert.equal((await owner.as.get('/budgets')).body.budgets.length, 1)
})

test('isolation: records cannot be pointed at another person\'s accounts, categories, goals or holdings', async () => {
  const owner = await createTestUser()
  const other = await createTestUser()
  const mine = await seedOwner(owner.as)
  await other.as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const theirs = (await other.as.post('/accounts').send({ name: 'Theirs', type: 'bank', currency: 'IDR', balance: 100000 })).body.account
  const before = await balanceOf(owner.as, mine.account.id)

  const attempts = [
    ['post', '/transactions', { accountId: mine.account.id, type: 'expense', amount: 1000 }],
    ['post', '/transactions', { accountId: theirs.id, type: 'expense', amount: 1000, categoryId: mine.category.id }],
    ['post', '/transfers', { fromAccountId: mine.account.id, toAccountId: theirs.id, amount: 1000 }],
    ['post', '/transfers', { fromAccountId: theirs.id, toAccountId: mine.account.id, amount: 1000 }],
    ['post', '/budgets', { categoryId: mine.category.id, period: '2026-11', limitAmount: 1000, currency: 'IDR' }],
    ['post', '/bills', { name: 'Sneaky', amount: 1000, dueDate: inDays(3), accountId: mine.account.id }],
    ['post', '/goals', { name: 'Sneaky', targetAmount: 1000, sources: [{ type: 'account', id: mine.account.id }] }],
    ['post', '/goals', { name: 'Sneaky', targetAmount: 1000, sources: [{ type: 'holding', id: mine.holding.id }] }],
    ['post', '/investments', { assetName: 'Sneaky', assetType: 'stock', quantity: 1, currency: 'IDR', totalSpent: 1000, price: 1000, accountId: mine.account.id }],
    ['post', `/investments/${(await other.as.post('/investments').send({ assetName: 'Own', assetType: 'stock', quantity: 1, currency: 'IDR', totalSpent: 1000, price: 1000 })).body.holding.id}/add`, { quantity: 1, price: 1000, totalSpent: 1000, accountId: mine.account.id }]
  ]
  for (const [method, path, body] of attempts) {
    const res = await other.as[method](path).send(body)
    assert.ok(res.status >= 400 && res.status < 500, `${method.toUpperCase()} ${path} ${JSON.stringify(body)} answered ${res.status}`)
  }
  assert.equal(await balanceOf(owner.as, mine.account.id), before)

  // Changing a transaction to another person's category is refused too.
  const own = (await other.as.post('/transactions').send({ accountId: theirs.id, type: 'expense', amount: 1000 })).body.transaction
  const moved = await other.as.patch(`/transactions/${own.id}`).send({ categoryId: mine.category.id })
  assert.ok(moved.status >= 400 && moved.status < 500, `moving to another person's category answered ${moved.status}`)
})

test('isolation: every section needs a login', async () => {
  const paths = [
    '/accounts', '/accounts/net-worth', '/transactions', '/transfers', '/categories', '/budgets', '/bills', '/bills/upcoming', '/goals',
    '/investments/portfolio', '/investments/history', '/investments/transactions', '/reports/dashboard', '/reports/trends', '/reports/cycle-trend',
    '/reports/net-worth-history', '/reports/expense-breakdown', '/insights', '/insights/config', '/insights/summary', '/auth/me'
  ]
  for (const path of paths) {
    const res = await request(app).get(path)
    assert.equal(res.status, 401, `GET ${path} answered ${res.status} without a login`)
  }
  for (const [path, body] of [['/smart-entry/parse', { text: 'x' }], ['/help/ask', { question: 'x' }], ['/transactions', {}], ['/transfers', {}]]) {
    assert.equal((await request(app).post(path).send(body)).status, 401, `POST ${path} needs a login`)
  }
  assert.equal((await request(app).put('/insights/preferences').send({ aiSummary: true })).status, 401)
})

test('isolation: a bill cannot be re-pointed at another person\'s account or category either', async () => {
  const owner = await createTestUser()
  const other = await createTestUser()
  const mine = await seedOwner(owner.as)
  await other.as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const own = (await other.as.post('/accounts').send({ name: 'Theirs', type: 'bank', currency: 'IDR', balance: 100000 })).body.account
  const bill = (await other.as.post('/bills').send({ name: 'Own bill', amount: 1000, dueDate: inDays(3), accountId: own.id })).body.bill
  assert.ok((await other.as.patch(`/bills/${bill.id}`).send({ accountId: mine.account.id })).status >= 400)
  assert.ok((await other.as.patch(`/bills/${bill.id}`).send({ categoryId: mine.category.id })).status >= 400)
  assert.equal((await other.as.patch(`/bills/${bill.id}`).send({ name: 'Renamed' })).status, 200)
})
