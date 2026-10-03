'use strict'
// Fills a dedicated demo account with ~6 months of realistic, entirely
// fictional data — for screenshots and live demos, never for real use.
//
//   npm run seed-demo
//
// Re-running is safe: the demo user (and everything it owns) is deleted and
// rebuilt from scratch each time. No other user is touched. Data is written
// through the same services the API uses, so account balances, budgets and
// investment logs stay consistent; only the past net-worth / portfolio
// history (which the app normally builds up one day at a time) is written
// directly to the snapshot tables.
const bcrypt = require('bcryptjs')
const { pool, query } = require('../db/pool')
const accountsService = require('../services/accounts')
const categoriesService = require('../services/categories')
const transactionsService = require('../services/transactions')
const transfersService = require('../services/transfers')
const budgetsService = require('../services/budgets')
const billsService = require('../services/bills')
const goalsService = require('../services/savingsGoals')
const investmentsService = require('../services/investments')
const reportsService = require('../services/reports')
const currencyService = require('../services/currency')
const periods = require('../shared/periods')

const DEMO_EMAIL = 'demo@example.com'
const DEMO_PASSWORD = 'DemoPass123!'
const HISTORY_CYCLES = 6
const PAYDAY = 25

// Seeded PRNG (mulberry32) so every run produces the same demo data.
let seed = 20260925
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (min, max) => min + random() * (max - min)
const chance = (p) => random() < p
const pick = (items) => items[Math.floor(random() * items.length)]
const roundTo = (value, step) => Math.round(value / step) * step

const pad = (n) => String(n).padStart(2, '0')
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (d, hour, minute = 0) => `${dateKey(d)}T${pad(hour)}:${pad(minute)}:00`
const addDays = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)

const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

async function resetDemoUser() {
  const existing = await query('SELECT id FROM users WHERE email = $1', [DEMO_EMAIL])
  const oldId = existing.rows[0]?.id
  if (oldId) {
    // Recurrence rules aren't owned by a user row directly, so they're
    // removed explicitly before the cascade deletes what references them.
    await query(
      `DELETE FROM recurrence_rules WHERE id IN (
         SELECT recurrence_rule_id FROM transactions WHERE user_id = $1 AND recurrence_rule_id IS NOT NULL
         UNION SELECT recurrence_rule_id FROM bills WHERE user_id = $1 AND recurrence_rule_id IS NOT NULL)`,
      [oldId]
    )
    await query('DELETE FROM users WHERE id = $1', [oldId])
  }
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const created = await query(
    'INSERT INTO users (email, password_hash, email_verified_at) VALUES ($1, $2, NOW()) RETURNING id',
    [DEMO_EMAIL, hash]
  )
  return created.rows[0].id
}

async function run() {
  await currencyService.catchUpIfStale()
  const usdRate = await currencyService.convertAmount(1, 'USD', 'IDR')
  if (!usdRate.available) {
    throw new Error('No USD→IDR exchange rate is cached. Connect to the internet and run this again.')
  }
  const usdToIdr = (usd) => usd * usdRate.amount

  const userId = await resetDemoUser()
  await accountsService.setDisplayCurrency(userId, 'IDR')
  await accountsService.setCycleStartDay(userId, PAYDAY)

  // --- Categories -----------------------------------------------------
  const cat = {}
  for (const c of await categoriesService.listCategories(userId)) cat[c.name] = c.id
  cat.Freelance = (await categoriesService.createCategory(userId, { name: 'Freelance' })).id
  cat.Coffee = (await categoriesService.createCategory(userId, { name: 'Coffee', parentCategoryId: cat['Food & Drink'] })).id
  cat.Subscriptions = (await categoriesService.createCategory(userId, { name: 'Subscriptions', parentCategoryId: cat['Bills & Utilities'] })).id

  // --- Accounts (opening balances as of the start of the history) -------
  const openingBalances = { bca: 21_500_000, jenius: 34_000_000, gopay: 350_000, cash: 400_000, wise: 850 }
  const acc = {
    bca: await accountsService.createAccount(userId, { name: 'BCA Payroll', type: 'bank', currency: 'IDR', balance: openingBalances.bca }),
    jenius: await accountsService.createAccount(userId, { name: 'Jenius Savings', type: 'bank', currency: 'IDR', balance: openingBalances.jenius }),
    gopay: await accountsService.createAccount(userId, { name: 'GoPay', type: 'e_wallet', currency: 'IDR', balance: openingBalances.gopay }),
    cash: await accountsService.createAccount(userId, { name: 'Cash Wallet', type: 'cash', currency: 'IDR', balance: openingBalances.cash }),
    wise: await accountsService.createAccount(userId, { name: 'Wise USD', type: 'bank', currency: 'USD', balance: openingBalances.wise })
  }

  // Running IDR-equivalent balance per day, for the net worth history chart.
  const cashDeltas = new Map()
  const recordDelta = (d, idrDelta) => {
    const key = dateKey(d)
    cashDeltas.set(key, (cashDeltas.get(key) || 0) + idrDelta)
  }
  const toIdr = (accountKey, amount) => (accountKey === 'wise' ? usdToIdr(amount) : amount)

  const income = async (accountKey, d, hour, amount, categoryId, notes) => {
    await transactionsService.createTransaction(userId, { accountId: acc[accountKey].id, categoryId, type: 'income', amount, occurredAt: at(d, hour), notes })
    recordDelta(d, toIdr(accountKey, amount))
  }
  const expense = async (accountKey, d, hour, amount, categoryId, notes) => {
    const created = await transactionsService.createTransaction(userId, {
      accountId: acc[accountKey].id, categoryId, type: 'expense', amount, occurredAt: at(d, hour, Math.floor(between(0, 59))), notes
    })
    recordDelta(d, -toIdr(accountKey, amount))
    return created
  }
  const transfer = async (fromKey, toKey, d, amount, notes, toAmount) => {
    await transfersService.createTransfer(userId, {
      fromAccountId: acc[fromKey].id, toAccountId: acc[toKey].id, amount, toAmount, occurredAt: at(d, 9), notes
    })
  }

  // --- Day-by-day activity ----------------------------------------------
  const { start: currentCycleStart } = periods.getCurrentPeriodBounds(PAYDAY, today)
  const historyStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() - HISTORY_CYCLES, PAYDAY)

  const meals = ['Lunch — nasi padang', 'Dinner with friends', 'Ramen', 'Lunch — warteg', 'Bakso', 'Sushi', 'Ayam geprek', 'Food delivery']
  const shops = ['Uniqlo', 'Tokopedia order', 'Shopee order', 'IKEA', 'Running shoes', 'Books — Gramedia']
  const fun = ['Cinema', 'Concert ticket', 'Bowling', 'Steam game', 'Karaoke']

  for (let d = new Date(historyStart); d <= today; d = addDays(d, 1)) {
    const isCurrentPayday = dateKey(d) === dateKey(currentCycleStart)

    if (d.getDate() === PAYDAY) {
      const salary = { accountId: acc.bca.id, categoryId: cat.Salary, type: 'income', amount: 18_500_000, occurredAt: at(d, 8), notes: 'Monthly salary' }
      if (isCurrentPayday) {
        // Only the latest salary is a live recurring rule — its next due
        // date is in the future, so the daily job won't backfill duplicates.
        await transactionsService.createRecurringTransaction(userId, { ...salary, recurrence: { frequency: 'monthly', interval: 1 } })
      } else {
        await transactionsService.createTransaction(userId, salary)
      }
      recordDelta(d, 18_500_000)
      await transfer('bca', 'jenius', addDays(d, 1) <= today ? addDays(d, 1) : d, 3_000_000, 'Monthly savings')
    }

    if (d.getDate() === 1) {
      await expense('bca', d, 10, 4_000_000, cat['Bills & Utilities'], 'Apartment rent')
      await expense('bca', d, 11, 385_000, cat['Bills & Utilities'], 'Internet — IndiHome')
      await expense('bca', d, 11, 150_000, cat['Bills & Utilities'], 'Phone plan')
      await expense('bca', d, 12, 186_000, cat.Subscriptions, 'Netflix')
      await expense('bca', d, 12, 150_000, cat.Health, 'BPJS health insurance')
      await transfer('bca', 'gopay', d, 1_500_000, 'GoPay top-up')
      await transfer('bca', 'cash', d, 500_000, 'ATM withdrawal')
    }
    if (d.getDate() === 3) await expense('bca', d, 15, roundTo(between(380_000, 520_000), 1_000), cat['Bills & Utilities'], 'Electricity — PLN')
    if (d.getDate() === 15) await transfer('bca', 'gopay', d, 1_000_000, 'GoPay top-up')

    // Daily spending
    await expense(chance(0.7) ? 'gopay' : 'cash', d, 12, roundTo(between(25_000, 75_000), 500), cat['Food & Drink'], pick(meals))
    if (chance(0.45)) await expense('bca', d, 19, roundTo(between(40_000, 160_000), 500), cat['Food & Drink'], pick(meals))
    if (chance(0.5)) await expense('gopay', d, 9, roundTo(between(28_000, 58_000), 500), cat.Coffee, pick(['Kopi Kenangan', 'Starbucks', 'Fore Coffee']))
    if (d.getDay() >= 1 && d.getDay() <= 5 && chance(0.8)) {
      await expense('gopay', d, 8, roundTo(between(15_000, 45_000), 500), cat.Transport, pick(['GoRide to office', 'GoCar', 'MRT + TransJakarta']))
    }
    if (d.getDay() === 6) await expense('bca', d, 10, roundTo(between(220_000, 420_000), 1_000), cat.Household, 'Weekly groceries')
    if (chance(0.06)) await expense('bca', d, 16, roundTo(between(150_000, 850_000), 1_000), cat.Shopping, pick(shops))
    if (d.getDay() === 5 && chance(0.4)) await expense('bca', d, 20, roundTo(between(75_000, 350_000), 1_000), cat.Entertainment, pick(fun))
    if (chance(0.02)) await expense('bca', d, 14, roundTo(between(120_000, 450_000), 1_000), cat.Health, pick(['Pharmacy', 'Dental check-up', 'Clinic visit']))
    if (d.getDate() === 20 && chance(0.5)) await expense('bca', d, 13, 1_100_000, cat.Shopping, 'Fuel + car wash')

    if (d.getDate() === 10 && chance(0.7)) {
      const usd = roundTo(between(250, 600), 5)
      await income('wise', d, 22, usd, cat.Freelance, 'Freelance web project')
    }
  }

  // A course purchase split across two categories, to show transaction splits.
  const split = await expense('bca', addDays(historyStart, 40), 14, 1_250_000, cat.Education, 'Online course + book')
  await transactionsService.splitTransaction(userId, split.id, [
    { amount: 950_000, categoryId: cat.Education, notes: 'Udemy — Full-stack course' },
    { amount: 300_000, categoryId: cat.Shopping, notes: 'Programming book' }
  ])

  // Moving some USD freelance income home.
  await transfer('wise', 'bca', addDays(historyStart, 70), 400, 'Convert freelance USD', roundTo(usdToIdr(400) * 0.99, 1_000))
  recordDelta(addDays(historyStart, 70), roundTo(usdToIdr(400) * 0.99, 1_000) - usdToIdr(400))

  // --- Budgets (current and previous two cycles) -------------------------
  const budgetLimits = {
    'Food & Drink': 3_500_000, Transport: 900_000, Shopping: 1_500_000,
    Entertainment: 600_000, Household: 1_400_000, 'Bills & Utilities': 5_500_000
  }
  for (let back = 0; back < 3; back++) {
    const { start } = periods.getPeriodBoundsForOffset(PAYDAY, back, today)
    const period = periods.periodKeyForDate(PAYDAY, start)
    for (const [name, limitAmount] of Object.entries(budgetLimits)) {
      await budgetsService.createBudget(userId, { categoryId: cat[name], period, limitAmount, currency: 'IDR' })
    }
  }

  // --- Bills ---------------------------------------------------------------
  const nextFirst = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const monthly = { frequency: 'monthly', interval: 1 }
  const bill = (name, amount, dueDate, categoryId, notes) => billsService.createBill(userId, {
    name, amount, dueDate: dateKey(dueDate), recurrence: monthly, accountId: acc.bca.id, categoryId, notes
  })
  await bill('Apartment Rent', 4_000_000, nextFirst, cat['Bills & Utilities'], 'Transfer to landlord')
  await bill('Internet — IndiHome', 385_000, nextFirst, cat['Bills & Utilities'])
  await bill('Phone Plan', 150_000, nextFirst, cat['Bills & Utilities'])
  await bill('Netflix', 186_000, nextFirst, cat.Subscriptions)
  await bill('Car Insurance', 650_000, addDays(today, 5), cat['Bills & Utilities'], 'Quarterly premium')
  await bill('Gym Membership', 350_000, addDays(today, -2), cat.Health)
  await billsService.createBill(userId, {
    name: 'Annual Domain Renewal', amount: 210_000, dueDate: dateKey(addDays(today, 12)), accountId: acc.bca.id, categoryId: cat.Subscriptions
  })

  // --- Savings goals ---------------------------------------------------------
  const goals = [
    { name: 'Emergency Fund', targetAmount: 60_000_000, targetDate: null, saved: [18_000_000, 3_000_000, 3_000_000, 3_000_000, 3_000_000] },
    { name: 'Trip to Japan', targetAmount: 25_000_000, targetDate: dateKey(new Date(today.getFullYear() + 1, 3, 1)), saved: [4_000_000, 2_500_000, 2_500_000, 1_500_000] },
    { name: 'New Laptop', targetAmount: 22_000_000, targetDate: dateKey(new Date(today.getFullYear(), today.getMonth() + 3, 1)), saved: [8_000_000, 5_000_000, 4_500_000] }
  ]
  for (const g of goals) {
    const goal = await goalsService.createGoal(userId, { name: g.name, targetAmount: g.targetAmount, targetDate: g.targetDate, accountId: acc.jenius.id })
    for (const amount of g.saved) await goalsService.contribute(userId, goal.id, amount)
  }

  // --- Investments -----------------------------------------------------------
  const monthsAgo = (m) => dateKey(new Date(today.getFullYear(), today.getMonth() - m, 12))
  const holdingsSpec = [
    { assetName: 'BBCA', assetType: 'stock', quantity: 1500, currency: 'IDR', costBasis: 9_150, price: 9_875, category: 'Indonesian Equities', purchasedAt: monthsAgo(14) },
    { assetName: 'BBRI', assetType: 'stock', quantity: 2500, currency: 'IDR', costBasis: 4_380, price: 4_210, category: 'Indonesian Equities', purchasedAt: monthsAgo(9) },
    { assetName: 'TLKM', assetType: 'stock', quantity: 3000, currency: 'IDR', costBasis: 3_050, price: 3_270, category: 'Indonesian Equities', purchasedAt: monthsAgo(7) },
    { assetName: 'Money Market Fund', assetType: 'mutual_fund', quantity: 8000, currency: 'IDR', costBasis: 1_812, price: 1_893, category: 'Money Market', purchasedAt: monthsAgo(11) },
    { assetName: 'VOO', assetType: 'etf', quantity: 6, currency: 'USD', costBasis: 486, price: 548, category: 'US Equities', purchasedAt: monthsAgo(12) },
    { assetName: 'Antam Gold', assetType: 'gold', quantity: 15, currency: 'IDR', costBasis: 1_390_000, price: 1_585_000, category: 'Gold', purchasedAt: monthsAgo(10) },
    { assetName: 'BTC', assetType: 'crypto', quantity: 0.012, currency: 'USD', costBasis: 64_500, price: 71_800, category: 'Crypto', purchasedAt: monthsAgo(8) }
  ]
  const holdings = []
  for (const spec of holdingsSpec) {
    const { price, ...input } = spec
    const holding = await investmentsService.addHolding(userId, input)
    await investmentsService.updatePrice(userId, holding.id, price)
    holdings.push({ ...spec, id: holding.id })
  }
  // A partial sale, so the investment activity log shows a realized gain.
  const bbca = holdings.find((h) => h.assetName === 'BBCA')
  await investmentsService.removeHolding(userId, bbca.id, 300)
  bbca.quantity -= 300

  // The activity log is stamped with the time of the call; move each entry
  // back to when it would really have happened.
  for (const h of holdings) {
    await query(
      `UPDATE investment_transactions SET occurred_at = $1 WHERE holding_id = $2 AND type = 'buy'`,
      [`${h.purchasedAt}T10:30:00`, h.id]
    )
  }
  await query(
    `UPDATE investment_transactions SET occurred_at = $1 WHERE holding_id = $2 AND type = 'sell'`,
    [at(addDays(today, -18), 14, 5), bbca.id]
  )

  await investmentsService.setAllocationTargets(userId, [
    { assetName: 'Indonesian Equities', targetPercentage: 25 },
    { assetName: 'US Equities', targetPercentage: 15 },
    { assetName: 'Money Market', targetPercentage: 10 },
    { assetName: 'Gold', targetPercentage: 15 },
    { assetName: 'Crypto', targetPercentage: 5 },
    { assetName: 'Bank', targetPercentage: 30 }
  ], 10)

  // --- History for the trend charts -------------------------------------------
  // Each holding's price drifts from its cost to today's price with a little
  // noise; account balances are replayed from the deltas recorded above.
  const priceOn = (h, d) => {
    const startTs = new Date(h.purchasedAt).getTime()
    const progress = Math.min(1, Math.max(0, (d.getTime() - startTs) / (today.getTime() - startTs)))
    const wobble = progress < 1 ? Math.sin(progress * 9 + h.id) * 0.035 + (random() - 0.5) * 0.02 : 0
    return (h.costBasis + (h.price - h.costBasis) * progress) * (1 + wobble)
  }

  let cashBalance = openingBalances.bca + openingBalances.jenius + openingBalances.gopay + openingBalances.cash + usdToIdr(openingBalances.wise)
  for (let d = new Date(historyStart); d < today; d = addDays(d, 1)) {
    cashBalance += cashDeltas.get(dateKey(d)) || 0
    let totalValue = 0
    let totalCost = 0
    for (const h of holdings) {
      if (new Date(h.purchasedAt) > d) continue
      const fx = h.currency === 'USD' ? usdRate.amount : 1
      const value = Math.round(h.quantity * priceOn(h, d) * fx * 100) / 100
      const cost = Math.round(h.quantity * h.costBasis * fx * 100) / 100
      totalValue += value
      totalCost += cost
      await query(
        `INSERT INTO investment_holding_snapshots (user_id, holding_id, snapshot_date, asset_name, value, cost_basis, display_currency)
         VALUES ($1, $2, $3, $4, $5, $6, 'IDR')`,
        [userId, h.id, dateKey(d), h.assetName, value, cost]
      )
    }
    await query(
      `INSERT INTO investment_snapshots (user_id, snapshot_date, total_value, total_cost_basis, display_currency)
       VALUES ($1, $2, $3, $4, 'IDR')`,
      [userId, dateKey(d), Math.round(totalValue * 100) / 100, Math.round(totalCost * 100) / 100]
    )
    await query(
      `INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, display_currency)
       VALUES ($1, $2, $3, 'IDR')`,
      [userId, dateKey(d), Math.round((cashBalance + totalValue) * 100) / 100]
    )
  }
  // Today's points come from the real, current numbers.
  await reportsService.takeNetWorthSnapshot(userId)
  await investmentsService.takeSnapshot(userId)

  const { netWorth } = await accountsService.getNetWorth(userId)
  console.log('Demo data ready.')
  console.log(`  Login:     ${DEMO_EMAIL}`)
  console.log(`  Password:  ${DEMO_PASSWORD}`)
  console.log(`  Net worth: IDR ${Math.round(netWorth).toLocaleString('en-US')}`)
}

run()
  .catch((err) => {
    console.error('Failed to seed demo data:', err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
