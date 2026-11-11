'use strict'
const { query, withTransaction } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, notFound, assertOwned } = require('../shared/utils')
const accountsService = require('./accounts')
const categoriesService = require('./categories')
const { validateFrequency, computeNextDueDate } = require('../shared/recurrence')
const { shiftNetWorthHistory } = require('./netWorthHistory')
const periods = require('../shared/periods')

const TYPES = ['income', 'expense']

const SQL = {
  create: loadSql('transactions/create'),
  createRecurrenceRule: loadSql('transactions/createRecurrenceRule'),
  createWithRecurrenceRule: loadSql('transactions/createWithRecurrenceRule'),
  getById: loadSql('transactions/getById'),
  update: loadSql('transactions/update'),
  delete: loadSql('transactions/delete'),
  createSplitPart: loadSql('transactions/createSplitPart'),
  listDueRecurrenceRules: loadSql('transactions/listDueRecurrenceRules'),
  getLatestByRecurrenceRule: loadSql('transactions/getLatestByRecurrenceRule'),
  createFromRecurrenceTemplate: loadSql('transactions/createFromRecurrenceTemplate'),
  advanceRecurrenceRuleDueDate: loadSql('transactions/advanceRecurrenceRuleDueDate')
}

const signedDelta = (type, amount) => (type === 'expense' ? -amount : amount)

// 'YYYY-MM-DD' is read as a local calendar date (new Date() would read it as
// UTC midnight, which is the previous day west of Greenwich).
const toLocalDate = (value) => {
  if (!value) return new Date()
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

// "Count in next cycle": the transaction keeps its real date, but budgets,
// the dashboard and reports place it in the cycle after the one that date
// falls in — e.g. a salary paid on the 8th when the cycle starts on the 10th.
// Stored as the start of that next cycle (a local date-time), or null.
const nextCycleDateFor = async (userId, occurredAt) => {
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const { start } = periods.getCurrentPeriodBounds(cycleStartDay, toLocalDate(occurredAt))
  const next = periods.nextPeriodStart(cycleStartDay, start)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}T00:00:00`
}

const validateCore = async (userId, { accountId, categoryId, type, amount }) => {
  if (!TYPES.includes(type)) throw badRequest(`type must be one of: ${TYPES.join(', ')}`)
  const numericAmount = Number(amount)
  if (!(numericAmount > 0)) throw badRequest('amount must be a positive number')

  const account = await accountsService.getAccountById(userId, accountId)
  let category = null
  if (categoryId !== undefined && categoryId !== null) {
    category = await categoriesService.requireCategory(userId, categoryId)
  }
  return { account, category, numericAmount }
}

const createTransaction = async (userId, body) => {
  const { accountId, categoryId, type, amount, occurredAt, notes, countInNextCycle } = body
  const { account, numericAmount } = await validateCore(userId, { accountId, categoryId, type, amount })
  const cycleDate = countInNextCycle ? await nextCycleDateFor(userId, occurredAt) : null

  const created = await withTransaction(async (client) => {
    const result = await client.query(SQL.create,
      [userId, account.id, categoryId || null, type, numericAmount, occurredAt || null, notes || null, cycleDate]
    )
    await accountsService.applyBalanceDelta(client, account.id, signedDelta(type, numericAmount))
    return result.rows[0]
  })
  await shiftNetWorthHistory(userId, [{ occurredAt: created.occurred_at, amount: signedDelta(type, numericAmount), currency: account.currency }])
  return created
}

const createRecurringTransaction = async (userId, body) => {
  const { frequency, interval = 1 } = body.recurrence || {}
  validateFrequency(frequency)

  const cycleDate = body.countInNextCycle ? await nextCycleDateFor(userId, body.occurredAt) : null
  const created = await withTransaction(async (client) => {
    const ruleResult = await client.query(SQL.createRecurrenceRule,
      [frequency, interval, computeNextDueDate(body.occurredAt || new Date(), frequency, interval)]
    )
    const rule = ruleResult.rows[0]

    const { account, numericAmount } = await validateCore(userId, body)
    const txnResult = await client.query(SQL.createWithRecurrenceRule,
      [userId, account.id, body.categoryId || null, body.type, numericAmount, body.occurredAt || null, body.notes || null, rule.id, cycleDate]
    )
    await accountsService.applyBalanceDelta(client, account.id, signedDelta(body.type, numericAmount))
    return { ...txnResult.rows[0], recurrenceRule: rule, accountCurrency: account.currency }
  })
  const { accountCurrency, ...transaction } = created
  await shiftNetWorthHistory(userId, [{ occurredAt: transaction.occurred_at, amount: signedDelta(body.type, Number(body.amount)), currency: accountCurrency }])
  return transaction
}

const getTransactionById = async (userId, id) => {
  const result = await query(SQL.getById, [id])
  return assertOwned(result.rows[0], userId, 'Transaction not found')
}

const updateTransaction = async (userId, id, updates) => {
  const existing = await getTransactionById(userId, id)
  const type = updates.type ?? existing.type
  const amount = updates.amount !== undefined ? Number(updates.amount) : Number(existing.amount)
  if (!TYPES.includes(type)) throw badRequest(`type must be one of: ${TYPES.join(', ')}`)
  if (!(amount > 0)) throw badRequest('amount must be a positive number')

  if (updates.categoryId !== undefined && updates.categoryId !== null) {
    await categoriesService.requireCategory(userId, updates.categoryId)
  }

  // Only fetched (and only validated as owned by this user) when the edit
  // form actually picked a different account — moving a transaction was
  // previously silently ignored entirely: the account_id column never
  // changed and neither account's balance was touched, because nothing here
  // read updates.accountId at all.
  const movingAccount = updates.accountId !== undefined && Number(updates.accountId) !== existing.account_id
    ? await accountsService.getAccountById(userId, updates.accountId)
    : null
  const accountId = movingAccount ? movingAccount.id : existing.account_id

  // `?? existing.X` / SQL's COALESCE($n, existing) both treat an explicit
  // null the same as "not sent at all", which made clearing a category or
  // notes back out impossible — the old value just silently stuck around.
  // Resolving the fallback here instead, with an explicit undefined check,
  // keeps "not sent" (keep existing) and "sent as null" (actually clear it)
  // distinguishable all the way to the UPDATE.
  const categoryId = updates.categoryId !== undefined ? updates.categoryId : existing.category_id
  const occurredAt = updates.occurredAt !== undefined ? updates.occurredAt : existing.occurred_at
  const notes = updates.notes !== undefined ? (updates.notes || null) : existing.notes
  const countInNextCycle = updates.countInNextCycle !== undefined ? Boolean(updates.countInNextCycle) : existing.cycle_date !== null
  const cycleDate = countInNextCycle ? await nextCycleDateFor(userId, occurredAt) : null

  const oldAccount = await accountsService.getAccountById(userId, existing.account_id)
  const oldDelta = signedDelta(existing.type, Number(existing.amount))
  const newDelta = signedDelta(type, amount)

  const updated = await withTransaction(async (client) => {

    const result = await client.query(SQL.update,
      [type, amount, categoryId, occurredAt, notes, accountId, cycleDate, existing.id]
    )
    if (movingAccount) {
      // Two different accounts — reverse the old delta entirely on the old
      // one and apply the full new delta on the new one, rather than
      // applying just the difference (which only makes sense when it's the
      // same account before and after).
      await accountsService.applyBalanceDelta(client, existing.account_id, -oldDelta)
      await accountsService.applyBalanceDelta(client, accountId, newDelta)
    } else {
      await accountsService.applyBalanceDelta(client, existing.account_id, newDelta - oldDelta)
    }
    return result.rows[0]
  })
  // Undo the old version's effect from its date, then apply the new one from
  // its (possibly different) date and account.
  await shiftNetWorthHistory(userId, [
    { occurredAt: existing.occurred_at, amount: -oldDelta, currency: oldAccount.currency },
    { occurredAt: updated.occurred_at, amount: newDelta, currency: (movingAccount || oldAccount).currency }
  ])
  return updated
}

const deleteTransaction = async (userId, id) => {
  const existing = await getTransactionById(userId, id)
  const account = await accountsService.getAccountById(userId, existing.account_id)
  const reversal = -signedDelta(existing.type, Number(existing.amount))
  await withTransaction(async (client) => {
    await client.query(SQL.delete, [existing.id])
    await accountsService.applyBalanceDelta(client, existing.account_id, reversal)
  })
  await shiftNetWorthHistory(userId, [{ occurredAt: existing.occurred_at, amount: reversal, currency: account.currency }])
}

// Replaces one transaction with several, same account/type/date, each with
// its own category and a slice of the original amount — e.g. one grocery
// run that was actually part household, part personal. No balance change
// happens here: the split amounts are required to add up to the original
// total, so the account's balance is untouched; only the categorization
// changes shape (design.md — inspired by Copilot Money's split feature,
// simplified to flat sibling rows instead of a parent/child link, since this
// app doesn't need to reconstruct "what was this originally" after a split).
const splitTransaction = async (userId, id, splits) => {
  const existing = await getTransactionById(userId, id)
  if (existing.recurrence_rule_id) {
    throw badRequest('Recurring transactions cannot be split')
  }
  if (!Array.isArray(splits) || splits.length < 2) {
    throw badRequest('Provide at least 2 splits')
  }

  let total = 0
  for (const s of splits) {
    const amount = Number(s.amount)
    if (!(amount > 0)) throw badRequest('Each split amount must be a positive number')
    total += amount
    if (s.categoryId !== undefined && s.categoryId !== null) {
      await categoriesService.requireCategory(userId, s.categoryId)
    }
  }

  // Rounded to cents before comparing, so ordinary float noise (e.g. three
  // even thirds) doesn't get rejected as "doesn't add up".
  const roundedTotal = Math.round(total * 100) / 100
  const originalAmount = Math.round(Number(existing.amount) * 100) / 100
  if (roundedTotal !== originalAmount) {
    throw badRequest(`Split amounts must add up to the original total of ${originalAmount}`)
  }

  return withTransaction(async (client) => {
    await client.query(SQL.delete, [existing.id])
    const created = []
    for (const s of splits) {
      const result = await client.query(SQL.createSplitPart,
        [userId, existing.account_id, s.categoryId || null, existing.type, Number(s.amount), existing.occurred_at, s.notes || existing.notes || null, existing.cycle_date]
      )
      created.push(result.rows[0])
    }
    return created
  })
}

// A budget cycle by its 'YYYY-MM' key (the month it starts in), defaulting
// to the current one ('current' or no key), with its bounds and display label.
const describeCycle = async (userId, requested) => {
  const period = requested === 'current' ? null : requested
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw badRequest('period must be in YYYY-MM format')
  const cycleStartDay = await accountsService.getCycleStartDay(userId)
  const currentPeriod = periods.periodKeyForDate(cycleStartDay, new Date())
  const key = period || currentPeriod
  const { start, end } = periods.periodKeyToBounds(cycleStartDay, key)
  return { period: key, periodLabel: periods.formatPeriodLabel(start, end, cycleStartDay), currentPeriod, start, end }
}

// Filter conditions are built dynamically based on which ones the caller
// passed, so this query stays inline rather than a static .sql file.
//
// `period` lists one budget cycle, placing each transaction the same way
// budgets and the dashboard do (counting "count in next cycle" ones in the
// cycle they were moved to); startDate/endDate filter by the real date.
// Within a day, the most recently recorded comes first.
const listTransactions = async (userId, { startDate, endDate, period, accountId, categoryId, type } = {}) => {
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw badRequest('startDate must not be after endDate')
  }

  const conditions = ['user_id = $1']
  const params = [userId]

  if (period) {
    const { start, end } = await describeCycle(userId, period)
    params.push(start, end)
    conditions.push(`COALESCE(cycle_date, occurred_at) >= $${params.length - 1}`, `COALESCE(cycle_date, occurred_at) <= $${params.length}`)
  }
  if (startDate) { params.push(startDate); conditions.push(`occurred_at >= $${params.length}`) }
  if (endDate) { params.push(endDate); conditions.push(`occurred_at <= $${params.length}`) }
  if (accountId) { params.push(accountId); conditions.push(`account_id = $${params.length}`) }
  if (categoryId) { params.push(categoryId); conditions.push(`category_id = $${params.length}`) }
  if (type) {
    if (!TYPES.includes(type)) throw badRequest(`type must be one of: ${TYPES.join(', ')}`)
    params.push(type)
    conditions.push(`type = $${params.length}`)
  }

  const result = await query(
    `SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY occurred_at::date DESC, created_at DESC, id DESC`,
    params
  )
  return result.rows
}

// Scheduled job: for every recurrence rule that is due, clone the most
// recent transaction created under that rule (its "template") and advance
// the rule's next_due_date (design.md Decision 4 — shared with bills).
const materializeDueRecurringTransactions = async () => {
  const dueRules = await query(SQL.listDueRecurrenceRules)
  let materialized = 0

  for (const rule of dueRules.rows) {
    const templateResult = await query(SQL.getLatestByRecurrenceRule, [rule.id])
    const template = templateResult.rows[0]
    if (!template) continue

    await withTransaction(async (client) => {
      await client.query(SQL.createFromRecurrenceTemplate,
        [template.user_id, template.account_id, template.category_id, template.type, template.amount, rule.next_due_date, template.notes, rule.id]
      )
      await accountsService.applyBalanceDelta(client, template.account_id, signedDelta(template.type, Number(template.amount)))
      await client.query(SQL.advanceRecurrenceRuleDueDate, [
        computeNextDueDate(rule.next_due_date, rule.frequency, rule.interval),
        rule.id
      ])
    })
    materialized += 1
  }

  return { materialized }
}

module.exports = {
  TYPES,
  createTransaction,
  createRecurringTransaction,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  splitTransaction,
  listTransactions,
  describeCycle,
  materializeDueRecurringTransactions
}
