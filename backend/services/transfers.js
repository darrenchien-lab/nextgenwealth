'use strict'
const { withTransaction, query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, conflict, assertOwned } = require('../shared/utils')
const accountsService = require('./accounts')
const currencyService = require('./currency')

const SQL = {
  create: loadSql('transfers/create'),
  list: loadSql('transfers/list'),
  getById: loadSql('transfers/getById'),
  findReversal: loadSql('transfers/findReversal')
}

// Shared by createTransfer and reverseTransfer — applies the balance delta
// to both accounts and inserts the transfer row, computing each account's
// resulting balance from the same before-balance/delta pair used for the
// actual update (never re-read afterward, so it can't drift).
const insertTransfer = async (userId, { fromAccount, toAccount, fromAmount, toAmount, occurredAt, notes, reversesTransferId }) => {
  const fromBalanceAfter = Math.round((Number(fromAccount.balance) - fromAmount) * 100) / 100
  const toBalanceAfter = Math.round((Number(toAccount.balance) + toAmount) * 100) / 100

  return withTransaction(async (client) => {
    await accountsService.applyBalanceDelta(client, fromAccount.id, -fromAmount)
    await accountsService.applyBalanceDelta(client, toAccount.id, toAmount)
    const result = await client.query(SQL.create,
      [userId, fromAccount.id, toAccount.id, fromAmount, toAmount, occurredAt || null, notes || null, fromBalanceAfter, toBalanceAfter, reversesTransferId || null]
    )
    return result.rows[0]
  })
}

// A transfer moves money between two of the user's own accounts. It is
// deliberately NOT a transaction (income/expense) — net worth doesn't
// change, so it must never be counted in income/expense/budget aggregates.
// Kept in its own table rather than a transaction "type" so none of the
// existing income/expense summing logic needs to filter it out.
//
// toAmount is optional and, when given, overrides the auto-converted
// amount entirely (no cached-rate lookup happens at all in that case). A
// real-world transfer (bank withdrawal, money changer, wire) uses whatever
// rate and fees that specific transaction actually applied, which will
// essentially never match our cached market rate (bridged through USD) —
// forcing the auto-converted figure would silently misrecord the actual
// amount the user received.
const createTransfer = async (userId, { fromAccountId, toAccountId, amount, toAmount, occurredAt, notes }) => {
  if (!fromAccountId || !toAccountId) throw badRequest('fromAccountId and toAccountId are required')
  if (Number(fromAccountId) === Number(toAccountId)) {
    throw badRequest('fromAccountId and toAccountId must be different accounts')
  }
  const numericAmount = Number(amount)
  if (!(numericAmount > 0)) throw badRequest('amount must be a positive number')

  const fromAccount = await accountsService.getAccountById(userId, fromAccountId)
  const toAccount = await accountsService.getAccountById(userId, toAccountId)

  let roundedToAmount
  if (toAmount !== undefined && toAmount !== null && toAmount !== '') {
    const numericToAmount = Number(toAmount)
    if (!(numericToAmount > 0)) throw badRequest('toAmount must be a positive number')
    roundedToAmount = Math.round(numericToAmount * 100) / 100
  } else {
    const { amount: convertedAmount, available } = await currencyService.convertAmount(
      numericAmount,
      fromAccount.currency,
      toAccount.currency
    )
    if (!available) {
      throw badRequest(`No exchange rate is cached to convert ${fromAccount.currency} to ${toAccount.currency} — enter the received amount manually`)
    }
    roundedToAmount = Math.round(convertedAmount * 100) / 100
  }

  return insertTransfer(userId, { fromAccount, toAccount, fromAmount: numericAmount, toAmount: roundedToAmount, occurredAt, notes })
}

const listTransfers = async (userId) => {
  const result = await query(SQL.list, [userId])
  return result.rows
}

const getTransferById = async (userId, id) => {
  const result = await query(SQL.getById, [id])
  return assertOwned(result.rows[0], userId, 'Transfer not found')
}

// Corrects a mistaken transfer by adding an offsetting entry rather than
// deleting the original — a straight delete-and-undo would leave every
// balance_after snapshot recorded on transfers made afterward silently
// wrong, with no way to fix them short of replaying the account's whole
// history. This is the standard double-entry bookkeeping approach: past
// entries are never rewritten, only corrected by a new one. The reversal
// moves the exact original amounts back the other way, canceling out both
// accounts' balance changes precisely (not a fresh currency-converted
// figure, which could drift from what was actually undone).
const reverseTransfer = async (userId, id) => {
  const transfer = await getTransferById(userId, id)
  if (transfer.reverses_transfer_id) {
    throw badRequest('This is already a reversal — it cannot itself be reversed')
  }
  const existingReversal = await query(SQL.findReversal, [transfer.id])
  if (existingReversal.rows.length > 0) {
    throw conflict('This transfer has already been reversed')
  }

  const fromAccount = await accountsService.getAccountById(userId, transfer.to_account_id)
  const toAccount = await accountsService.getAccountById(userId, transfer.from_account_id)

  return insertTransfer(userId, {
    fromAccount,
    toAccount,
    fromAmount: Number(transfer.to_amount),
    toAmount: Number(transfer.from_amount),
    notes: `Reversal of transfer #${transfer.id}`,
    reversesTransferId: transfer.id
  })
}

module.exports = { createTransfer, listTransfers, getTransferById, reverseTransfer }
