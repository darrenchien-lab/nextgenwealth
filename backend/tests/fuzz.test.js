'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createTestUser, cleanupTestUsers } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

const inDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Routes that call outside services, end the session, or are covered by their own tests.
const SKIP = [/^\/auth\//, /^\/smart-entry/, /^\/help/, /prices\/refresh/, /market\//, /\/price-source$/, /^\/reports\/export/]

const mounts = () => {
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8')
  return [...app.matchAll(/app\.use\('(\/[a-z-]+)', require\('\.\/routes\/(\w+)'\)\)/g)].map((m) => ({ prefix: m[1], file: m[2] }))
}

const routeList = () => {
  const out = []
  for (const { prefix, file } of mounts()) {
    const src = fs.readFileSync(path.join(__dirname, `../routes/${file}.js`), 'utf8')
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\('([^']*)'/g)) {
      const full = (prefix + m[2]).replace(/\/$/, '')
      if (!SKIP.some((re) => re.test(full))) out.push({ method: m[1], path: full })
    }
  }
  return out
}

const PAYLOADS = [
  undefined,
  {},
  { amount: 'abc', quantity: 'abc', price: 'abc', name: 123, accountId: 'x', categoryId: 'x' },
  { amount: -5, quantity: -1, price: -1, targetAmount: -1, limitAmount: -1, delta: 'NaN' },
  { amount: 1e30, quantity: 1e30, price: 1e30, totalSpent: 1e30, targetAmount: 1e30, delta: 1e30 },
  { name: null, assetName: null, currency: null, type: null, period: null, dueDate: 'not-a-date', date: 'nope', occurredAt: 'nope' },
  { accountId: 999999999, categoryId: 999999999, fromAccountId: 999999999, toAccountId: 999999999, holdingId: 999999999 },
  { sources: 'x', splits: 'x', recurrence: 'x', providerConfig: 'x' },
  { sources: [null, 5, { type: 'x' }], splits: [null, {}, { amount: 'a' }], recurrence: { frequency: 'hourly' } },
  { name: 'x'.repeat(5000), notes: 'y'.repeat(100000) }
]

test('fuzz: no route crashes on empty, wrong-typed, huge or hostile input', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await as.post('/accounts').send({ name: 'Fuzz', type: 'bank', currency: 'IDR', balance: 1000000 })).body.account
  const second = (await as.post('/accounts').send({ name: 'Fuzz 2', type: 'bank', currency: 'IDR', balance: 1000 })).body.account
  const txn = (await as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 1000 })).body.transaction
  const transfer = (await as.post('/transfers').send({ fromAccountId: account.id, toAccountId: second.id, amount: 100 })).body.transfer
  const category = (await as.get('/categories')).body.categories[0]
  const budget = (await as.post('/budgets').send({ categoryId: category.id, period: '2026-11', limitAmount: 1000, currency: 'IDR' })).body.budget
  const bill = (await as.post('/bills').send({ name: 'Fuzz bill', amount: 1000, dueDate: inDays(2), accountId: account.id })).body.bill
  const goal = (await as.post('/goals').send({ name: 'Fuzz goal', targetAmount: 1000 })).body.goal
  const holding = (await as.post('/investments').send({ assetName: 'FUZZ', assetType: 'stock', quantity: 10, currency: 'IDR', totalSpent: 1000, price: 100 })).body.holding

  const ids = { accounts: account.id, transactions: txn.id, transfers: transfer.id, budgets: budget.id, bills: bill.id, goals: goal.id, investments: holding.id, categories: category.id }
  const crashes = []
  const routes = routeList()
  // Deleting last, so the records exist while the other routes are tried.
  routes.sort((a, b) => Number(a.method === 'delete') - Number(b.method === 'delete'))

  for (const { method, path: route } of routes) {
    const section = route.split('/')[1]
    const url = route.replace(':id', ids[section] ?? 1)
    for (const payload of PAYLOADS) {
      if (method === 'get' && payload !== undefined) continue
      const req = as[method](url)
      const res = await (payload === undefined || method === 'get' || method === 'delete' ? req : req.send(payload))
      if (res.status >= 500) crashes.push(`${method.toUpperCase()} ${url} ${JSON.stringify(payload)?.slice(0, 80)} -> ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`)
    }
  }
  assert.deepEqual(crashes, [], `routes that crashed:\n${crashes.join('\n')}`)
})

// Every page-loading request answers 200 for a brand-new person and for one with data.
test('fuzz: every list and report endpoint answers 200, for an empty account and a busy one', async () => {
  const empty = await createTestUser()
  const busy = await createTestUser()
  await busy.as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const account = (await busy.as.post('/accounts').send({ name: 'Busy', type: 'bank', currency: 'IDR', balance: 5000000 })).body.account
  const category = (await busy.as.get('/categories')).body.categories[0]
  await busy.as.post('/transactions').send({ accountId: account.id, type: 'expense', amount: 50000, categoryId: category.id })
  await busy.as.post('/transactions').send({ accountId: account.id, type: 'income', amount: 800000 })
  await busy.as.post('/budgets').send({ categoryId: category.id, period: '2026-11', limitAmount: 100000, currency: 'IDR' })
  await busy.as.post('/bills').send({ name: 'Bill', amount: 1000, dueDate: inDays(2), accountId: account.id })
  await busy.as.post('/goals').send({ name: 'Goal', targetAmount: 1000000 })
  await busy.as.post('/investments').send({ assetName: 'SMOKE', assetType: 'stock', quantity: 10, currency: 'IDR', totalSpent: 1000, price: 100 })

  // cash-flow needs a date range of its own, so it has no plain request to try.
  const gets = routeList().filter((r) => r.method === 'get' && !r.path.includes(':id') && r.path !== '/reports/cash-flow')
  const failures = []
  for (const who of [empty, busy]) {
    for (const { path: route } of gets) {
      const res = await who.as.get(route)
      if (res.status !== 200) failures.push(`${who === empty ? 'empty' : 'busy'} GET ${route} -> ${res.status} ${JSON.stringify(res.body).slice(0, 100)}`)
    }
  }
  assert.deepEqual(failures, [], `endpoints that did not answer 200:\n${failures.join('\n')}`)
})
