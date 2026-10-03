'use strict'
const { query, withTransaction } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, notFound, assertOwned } = require('../shared/utils')
const accountsService = require('./accounts')
const categoriesService = require('./categories')
const { validateFrequency, computeNextDueDate } = require('../shared/recurrence')

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
  const { accountId, categoryId, type, amount, occurredAt, notes } = body
  const { account, numericAmount } = await validateCore(userId, { accountId, categoryId, type, amount })

  return withTransaction(async (client) => {
    const result = await client.query(SQL.create,
      [userId, account.id, categoryId || null, type, numericAmount, occurredAt || null, notes || null]
    )
    await accountsService.applyBalanceDelta(client, account.id, signedDelta(type, numericAmount))
    return result.rows[0]
  })
}

const createRecurringTransaction = async (userId, body) => {
  const { frequency, interval = 1 } = body.recurrence || {}
  validateFrequency(frequency)

  return withTransaction(async (client) => {
    const ruleResult = await client.query(SQL.createRecurrenceRule,
      [frequency, interval, computeNextDueDate(body.occurredAt || new Date(), frequency, interval)]
    )
    const rule = ruleResult.rows[0]

    const { account, numericAmount } = await validateCore(userId, body)
    const txnResult = await client.query(SQL.createWithRecurrenceRule,
      [userId, account.id, body.categoryId || null, body.type, numericAmount, body.occurredAt || null, body.notes || null, rule.id]
    )
    await accountsService.applyBalanceDelta(client, account.id, signedDelta(body.type, numericAmount))
    return { ...txnResult.rows[0], recurrenceRule: rule }
  })
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

  return withTransaction(async (client) => {
    const oldDelta = signedDelta(existing.type, Number(existing.amount))
    const newDelta = signedDelta(type, amount)

    const result = await client.query(SQL.update,
      [type, amount, categoryId, occurredAt, notes, accountId, existing.id]
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
}

const deleteTransaction = async (userId, id) => {
  const existing = await getTransactionById(userId, id)
  return withTransaction(async (client) => {
    await client.query(SQL.delete, [existing.id])
    const reversal = -signedDelta(existing.type, Number(existing.amount))
    await accountsService.applyBalanceDelta(client, existing.account_id, reversal)
  })
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
        [userId, existing.account_id, s.categoryId || null, existing.type, Number(s.amount), existing.occurred_at, s.notes || existing.notes || null]
      )
      created.push(result.rows[0])
    }
    return created
  })
}

// Filter conditions are built dynamically based on which ones the caller
// passed, so this query stays inline rather than a static .sql file.
const listTransactions = async (userId, { startDate, endDate, accountId, categoryId, type } = {}) => {
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw badRequest('startDate must not be after endDate')
  }

  const conditions = ['user_id = $1']
  const params = [userId]

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
    `SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY occurred_at DESC`,
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
  materializeDueRecurringTransactions
}
