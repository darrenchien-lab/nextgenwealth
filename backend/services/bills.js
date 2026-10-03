'use strict'
const { query, withTransaction } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, conflict, assertOwned } = require('../shared/utils')
const { validateFrequency, computeNextDueDate } = require('../shared/recurrence')
const accountsService = require('./accounts')
const currencyService = require('./currency')

require('dotenv').config()
const DEFAULT_REMINDER_WINDOW_DAYS = Number(process.env.BILL_REMINDER_WINDOW_DAYS || 7)

const SQL = {
  createRecurrenceRule: loadSql('bills/createRecurrenceRule'),
  create: loadSql('bills/create'),
  update: loadSql('bills/update'),
  getById: loadSql('bills/getById'),
  insertPaymentTransaction: loadSql('bills/insertPaymentTransaction'),
  getRecurrenceRuleById: loadSql('bills/getRecurrenceRuleById'),
  advanceRecurrenceRuleDueDate: loadSql('bills/advanceRecurrenceRuleDueDate'),
  rollToNextCycle: loadSql('bills/rollToNextCycle'),
  markPaid: loadSql('bills/markPaid'),
  markOverdueForUser: loadSql('bills/markOverdueForUser'),
  listUpcoming: loadSql('bills/listUpcoming'),
  listAll: loadSql('bills/listAll'),
  flagAllOverdue: loadSql('bills/flagAllOverdue'),
  cancel: loadSql('bills/cancel'),
  countPaidHistory: loadSql('bills/countPaidHistory'),
  delete: loadSql('bills/delete')
}

const createBill = async (userId, { name, amount, dueDate, recurrence, accountId, categoryId, notes }) => {
  if (typeof name !== 'string' || name.trim() === '') throw badRequest('Bill name is required')
  const numericAmount = Number(amount)
  if (!(numericAmount > 0)) throw badRequest('amount must be a positive number')
  if (!dueDate) throw badRequest('dueDate is required')

  let recurrenceRuleId = null
  if (recurrence) {
    validateFrequency(recurrence.frequency)
    const ruleResult = await query(SQL.createRecurrenceRule, [recurrence.frequency, recurrence.interval || 1, dueDate])
    recurrenceRuleId = ruleResult.rows[0].id
  }

  const result = await query(SQL.create,
    [userId, name.trim(), numericAmount, dueDate, recurrenceRuleId, accountId || null, categoryId || null, notes?.trim() || null]
  )
  return result.rows[0]
}

// Only the bill's own fields (not its recurrence) can be edited — e.g.
// linking an account after the fact so it can actually be paid, since it
// was created without one.
const updateBill = async (userId, id, { name, amount, dueDate, accountId, categoryId, notes }) => {
  const bill = await getBillById(userId, id)

  const updatedName = name !== undefined ? name : bill.name
  if (typeof updatedName !== 'string' || updatedName.trim() === '') throw badRequest('Bill name is required')

  const updatedAmount = amount !== undefined ? Number(amount) : Number(bill.amount)
  if (!(updatedAmount > 0)) throw badRequest('amount must be a positive number')

  const updatedDueDate = dueDate !== undefined ? dueDate : bill.due_date
  if (!updatedDueDate) throw badRequest('dueDate is required')

  const updatedAccountId = accountId !== undefined ? (accountId || null) : bill.account_id
  const updatedCategoryId = categoryId !== undefined ? (categoryId || null) : bill.category_id
  const updatedNotes = notes !== undefined ? (notes?.trim() || null) : bill.notes

  const result = await query(SQL.update,
    [updatedName.trim(), updatedAmount, updatedDueDate, updatedAccountId, updatedCategoryId, updatedNotes, bill.id]
  )
  return result.rows[0]
}

const getBillById = async (userId, id) => {
  const result = await query(SQL.getById, [id])
  return assertOwned(result.rows[0], userId, 'Bill not found')
}

const payBill = async (userId, id) => {
  const bill = await getBillById(userId, id)
  if (bill.status === 'paid') throw conflict('This bill cycle has already been paid')
  if (!bill.account_id) throw badRequest('Bill has no linked account to pay from')

  return withTransaction(async (client) => {
    await client.query(SQL.insertPaymentTransaction, [userId, bill.account_id, bill.category_id, bill.amount, bill.id, bill.notes])
    await accountsService.applyBalanceDelta(client, bill.account_id, -Number(bill.amount))

    if (bill.recurrence_rule_id) {
      const ruleResult = await client.query(SQL.getRecurrenceRuleById, [bill.recurrence_rule_id])
      const rule = ruleResult.rows[0]
      const nextDueDate = computeNextDueDate(bill.due_date, rule.frequency, rule.interval)
      await client.query(SQL.advanceRecurrenceRuleDueDate, [nextDueDate, rule.id])
      const updated = await client.query(SQL.rollToNextCycle, [nextDueDate, bill.id])
      return updated.rows[0]
    }

    const updated = await client.query(SQL.markPaid, [bill.id])
    return updated.rows[0]
  })
}

const listUpcomingBills = async (userId, windowDays = DEFAULT_REMINDER_WINDOW_DAYS) => {
  await query(SQL.markOverdueForUser, [userId])

  const result = await query(SQL.listUpcoming, [userId, windowDays])
  return result.rows.map((bill) => ({ ...bill, isOverdue: bill.status === 'overdue' }))
}

// Sums upcoming bills into the user's display currency via each bill's
// linked account's currency — a bill with no linked account has no known
// currency yet, so it's excluded from the total (same as an unconvertible
// rate would be) rather than guessed at.
const getUpcomingBillsTotal = async (userId, windowDays = DEFAULT_REMINDER_WINDOW_DAYS) => {
  const bills = await listUpcomingBills(userId, windowDays)
  const displayCurrency = await accountsService.getDisplayCurrency(userId)

  let total = 0
  let hasUnconverted = false
  for (const bill of bills) {
    if (!bill.account_id) continue
    const account = await accountsService.getAccountById(userId, bill.account_id)
    const { amount, available } = await currencyService.convertAmount(Number(bill.amount), account.currency, displayCurrency)
    if (!available) { hasUnconverted = true; continue }
    total += amount
  }

  return { total: Math.round(total * 100) / 100, displayCurrency, hasUnconverted }
}

// Unlike listUpcomingBills, this isn't limited to a reminder window — a bill
// due further out (e.g. next month) still exists and should be visible
// somewhere, not just silently absent until it enters the reminder window.
const listAllBills = async (userId) => {
  await query(SQL.markOverdueForUser, [userId])

  const result = await query(SQL.listAll, [userId])
  return result.rows.map((bill) => ({ ...bill, isOverdue: bill.status === 'overdue' }))
}

// Scheduled job companion to listUpcomingBills' inline flagging, so overdue
// status is kept fresh even for users who haven't loaded their bills lately.
const flagOverdueBills = async () => {
  const result = await query(SQL.flagAllOverdue)
  return { flagged: result.rowCount }
}

const cancelBill = async (userId, id) => {
  const bill = await getBillById(userId, id)
  const result = await query(SQL.cancel, [bill.id])
  return result.rows[0]
}

const deleteBill = async (userId, id) => {
  const bill = await getBillById(userId, id)
  const paidHistory = await query(SQL.countPaidHistory, [bill.id])
  if (Number(paidHistory.rows[0].count) > 0) {
    throw conflict('Bill has paid history; cancel it instead of deleting it')
  }
  await query(SQL.delete, [bill.id])
}

module.exports = { createBill, getBillById, updateBill, payBill, listUpcomingBills, getUpcomingBillsTotal, listAllBills, flagOverdueBills, cancelBill, deleteBill }
