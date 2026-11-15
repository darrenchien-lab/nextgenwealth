'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestUser, cleanupTestUsers } = require('./helpers')

after(async () => {
  await cleanupTestUsers()
})

const day = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ok = (res, what) => assert.ok(res.status >= 200 && res.status < 300, `${what} answered ${res.status}: ${JSON.stringify(res.body)}`)

// Whatever mix of things a person does, each account's stored balance must
// still equal its opening balance plus every recorded movement.
test('ledger: balances stay equal to the recorded movements after every kind of change', async () => {
  const { as } = await createTestUser()
  await as.put('/accounts/display-currency').send({ currency: 'IDR' })
  const main = (await as.post('/accounts').send({ name: 'Main', type: 'bank', currency: 'IDR', balance: 10000000 })).body.account
  const wallet = (await as.post('/accounts').send({ name: 'Wallet', type: 'e_wallet', currency: 'IDR', balance: 500000 })).body.account
  const category = (await as.get('/categories')).body.categories[0]

  // Transactions: add, edit amount, move to another account, change type, delete, split.
  const t1 = (await as.post('/transactions').send({ accountId: main.id, type: 'expense', amount: 100000, categoryId: category.id, occurredAt: day(5) })).body.transaction
  const t2 = (await as.post('/transactions').send({ accountId: main.id, type: 'income', amount: 3000000, occurredAt: day(4) })).body.transaction
  const t3 = (await as.post('/transactions').send({ accountId: wallet.id, type: 'expense', amount: 45000 })).body.transaction
  const t4 = (await as.post('/transactions').send({ accountId: main.id, type: 'expense', amount: 90000 })).body.transaction
  ok(await as.patch(`/transactions/${t1.id}`).send({ amount: 150000 }), 'edit amount')
  ok(await as.patch(`/transactions/${t3.id}`).send({ accountId: main.id }), 'move account')
  ok(await as.patch(`/transactions/${t2.id}`).send({ type: 'expense' }), 'change type')
  ok(await as.delete(`/transactions/${t4.id}`), 'delete')
  ok(await as.post(`/transactions/${t1.id}/split`).send({ splits: [{ amount: 100000, categoryId: category.id }, { amount: 50000, categoryId: category.id }] }), 'split')

  // Transfers, and undoing one.
  const tr1 = (await as.post('/transfers').send({ fromAccountId: main.id, toAccountId: wallet.id, amount: 250000 })).body.transfer
  ok(await as.post('/transfers').send({ fromAccountId: wallet.id, toAccountId: main.id, amount: 20000, occurredAt: day(2) }), 'second transfer')
  ok(await as.post(`/transfers/${tr1.id}/reverse`), 'reverse transfer')

  // A bill paid, one of them repeating.
  const bill = (await as.post('/bills').send({ name: 'Internet', amount: 300000, dueDate: day(0), accountId: main.id })).body.bill
  ok(await as.post(`/bills/${bill.id}/pay`).send({}), 'pay bill')
  const repeating = (await as.post('/bills').send({ name: 'Gym', amount: 150000, dueDate: day(0), accountId: wallet.id, recurrence: { frequency: 'monthly' } })).body.bill
  ok(await as.post(`/bills/${repeating.id}/pay`).send({}), 'pay repeating bill')

  // Investments paid from and into an account.
  const holding = (await as.post('/investments').send({ assetName: 'LEDGR', assetType: 'stock', quantity: 100, currency: 'IDR', totalSpent: 1002000, price: 10000, accountId: main.id })).body.holding
  ok(await as.post(`/investments/${holding.id}/add`).send({ quantity: 50, price: 10100, totalSpent: 506000, accountId: main.id }), 'buy more')
  ok(await as.post(`/investments/${holding.id}/remove`).send({ quantity: 60, price: 10500, totalReceived: 628000, accountId: wallet.id }), 'sell')

  // A hand correction of a balance.
  ok(await as.patch(`/accounts/${wallet.id}/adjust`).send({ delta: 1000 }), 'adjust balance')
  ok(await as.post('/transactions').send({ accountId: wallet.id, type: 'income', amount: 1000 }), 'income after adjust')

  const reconcile = (await as.post('/accounts/reconcile')).body
  assert.deepEqual(reconcile.mismatches, [], `balance drift: ${JSON.stringify(reconcile.mismatches)}`)
  for (const account of [main, wallet]) {
    const statement = (await as.get(`/accounts/${account.id}/statement`)).body
    assert.equal(statement.consistent, true, `statement of ${account.name} does not walk back to its opening balance`)
  }
})
