'use strict'
const { query, withTransaction } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, conflict, assertOwned } = require('../shared/utils')
const { isValidCurrencyCode } = require('../shared/currencyCodes')
const currencyService = require('./currency')

const ACCOUNT_TYPES = ['bank', 'e_wallet', 'cash', 'credit_card']

const SQL = {
  createAccount: loadSql('accounts/createAccount'),
  listActiveCurrencies: loadSql('accounts/listActiveCurrencies'),
  listActiveHoldingCurrencies: loadSql('accounts/listActiveHoldingCurrencies'),
  getById: loadSql('accounts/getById'),
  list: loadSql('accounts/list'),
  listIncludingArchived: loadSql('accounts/listIncludingArchived'),
  applyBalanceDelta: loadSql('accounts/applyBalanceDelta'),
  adjustBalance: loadSql('accounts/adjustBalance'),
  archive: loadSql('accounts/archive'),
  unarchive: loadSql('accounts/unarchive'),
  countTransactionsForAccount: loadSql('accounts/countTransactionsForAccount'),
  delete: loadSql('accounts/delete'),
  getDisplayCurrency: loadSql('accounts/getDisplayCurrency'),
  setDisplayCurrency: loadSql('accounts/setDisplayCurrency'),
  getCycleStartDay: loadSql('accounts/getCycleStartDay'),
  setCycleStartDay: loadSql('accounts/setCycleStartDay'),
  getOpenInvestmentHoldings: loadSql('accounts/getOpenInvestmentHoldings'),
  getLedgerDeltaForAccount: loadSql('accounts/getLedgerDeltaForAccount'),
  logBalanceAdjustment: loadSql('accounts/logBalanceAdjustment'),
  getLatestBalanceAdjustment: loadSql('accounts/getLatestBalanceAdjustment')
}

const createAccount = async (userId, { name, type, currency, balance }) => {
  if (typeof name !== 'string' || name.trim() === '') throw badRequest('Account name is required')
  if (!ACCOUNT_TYPES.includes(type)) throw badRequest(`Account type must be one of: ${ACCOUNT_TYPES.join(', ')}`)
  if (!isValidCurrencyCode(currency)) throw badRequest('A valid ISO 4217 currency code is required')
  const initialBalance = balance === undefined ? 0 : Number(balance)
  if (Number.isNaN(initialBalance)) throw badRequest('Initial balance must be a number')

  const result = await query(SQL.createAccount, [userId, name.trim(), type, currency.toUpperCase(), initialBalance])
  return result.rows[0]
}

// Every currency actually in use across the user's active accounts and
// investment holdings, converted to their display currency — a
// transparency view so a "why did my net worth move" question can be
// answered by checking the rate itself instead of just trusting the total.
const getActiveExchangeRates = async (userId) => {
  const displayCurrency = await getDisplayCurrency(userId)

  const [accountCurrencies, holdingCurrencies] = await Promise.all([
    query(SQL.listActiveCurrencies, [userId]),
    query(SQL.listActiveHoldingCurrencies, [userId])
  ])

  const currencies = new Set([
    ...accountCurrencies.rows.map((r) => r.currency),
    ...holdingCurrencies.rows.map((r) => r.currency)
  ])
  currencies.delete(displayCurrency)

  const rates = []
  for (const currency of currencies) {
    const converted = await currencyService.convertAmount(1, currency, displayCurrency)
    rates.push({
      currency,
      rateToDisplay: converted.available ? converted.amount : null,
      asOf: converted.asOf
    })
  }
  rates.sort((a, b) => a.currency.localeCompare(b.currency))

  return { displayCurrency, rates }
}

const getAccountById = async (userId, accountId) => {
  const result = await query(SQL.getById, [accountId])
  return assertOwned(result.rows[0], userId, 'Account not found')
}

const listAccounts = async (userId, { includeArchived = false } = {}) => {
  const sql = includeArchived ? SQL.listIncludingArchived : SQL.list
  const result = await query(sql, [userId])
  return result.rows
}

// Shared by the transactions module so every write to an account's balance
// goes through this one function, keeping the cached balance and the ledger
// in sync inside the same DB transaction (design.md Decision 2).
const applyBalanceDelta = async (client, accountId, delta) => {
  await client.query(SQL.applyBalanceDelta, [delta, accountId])
}

// Logs the correction to balance_adjustments in the same DB transaction as
// the balance change itself, so reconcileBalances has a real anchor point
// to reconstruct "expected" from instead of only ever knowing about
// transactions/transfers (see that function's comment).
const adjustBalance = async (userId, accountId, delta) => {
  if (typeof delta !== 'number' || Number.isNaN(delta)) throw badRequest('Adjustment amount must be a number')
  const account = await getAccountById(userId, accountId)
  return withTransaction(async (client) => {
    const result = await client.query(SQL.adjustBalance, [delta, account.id])
    const updated = result.rows[0]
    await client.query(SQL.logBalanceAdjustment, [account.id, delta, updated.balance])
    return updated
  })
}

const archiveAccount = async (userId, accountId) => {
  const account = await getAccountById(userId, accountId)
  const result = await query(SQL.archive, [account.id])
  return result.rows[0]
}

const unarchiveAccount = async (userId, accountId) => {
  const account = await getAccountById(userId, accountId)
  const result = await query(SQL.unarchive, [account.id])
  return result.rows[0]
}

const deleteAccount = async (userId, accountId) => {
  const account = await getAccountById(userId, accountId)
  const txnCount = await query(SQL.countTransactionsForAccount, [account.id])
  if (Number(txnCount.rows[0].count) > 0) {
    throw conflict('Account has existing transactions; archive it instead of deleting it')
  }
  await query(SQL.delete, [account.id])
};

const getDisplayCurrency = async (userId) => {
  const result = await query(SQL.getDisplayCurrency, [userId])
  return result.rows[0]?.display_currency || 'IDR'
}

const setDisplayCurrency = async (userId, currency) => {
  if (!isValidCurrencyCode(currency)) throw badRequest('A valid ISO 4217 currency code is required')
  await query(SQL.setDisplayCurrency, [currency.toUpperCase(), userId])
  return { displayCurrency: currency.toUpperCase() }
}

// Defines when a user's "month" starts for period-based reporting (dashboard
// summary, cash flow, monthly trend, expense breakdown, budgets) — e.g. a
// payday-based cutoff instead of the calendar's 1st. Capped at 28 so every
// month (including February) actually has that day.
const getCycleStartDay = async (userId) => {
  const result = await query(SQL.getCycleStartDay, [userId])
  return result.rows[0]?.budget_cycle_start_day || 1
}

const setCycleStartDay = async (userId, day) => {
  const numericDay = Number(day)
  if (!Number.isInteger(numericDay) || numericDay < 1 || numericDay > 28) {
    throw badRequest('cycleStartDay must be an integer between 1 and 28')
  }
  await query(SQL.setCycleStartDay, [numericDay, userId])
  return { cycleStartDay: numericDay }
}

// Queries investment_holdings directly rather than requiring services/investments
// (which itself requires this module for getDisplayCurrency) — avoids a
// circular require between the two service modules (design.md Decision 2a).
const getInvestmentsTotal = async (userId, displayCurrency) => {
  const result = await query(SQL.getOpenInvestmentHoldings, [userId])

  let total = 0
  let allConverted = true
  for (const holding of result.rows) {
    const { amount, available } = await currencyService.convertAmount(
      Number(holding.quantity) * Number(holding.current_price),
      holding.currency,
      displayCurrency
    )
    if (!available) { allConverted = false; continue }
    total += amount
  }
  return { total, allConverted }
}

const getNetWorth = async (userId) => {
  const displayCurrency = await getDisplayCurrency(userId)
  const accounts = await listAccounts(userId)

  let netWorth = 0
  let allConverted = true
  for (const account of accounts) {
    const { amount, available } = await currencyService.convertAmount(
      Number(account.balance),
      account.currency,
      displayCurrency
    )
    if (!available) {
      allConverted = false
      continue
    }
    // A credit card's balance goes negative as it's spent on (every ledger
    // entry treats it like any other account), so it's already signed as a
    // liability and is summed as-is.
    netWorth += amount
  }

  const investments = await getInvestmentsTotal(userId, displayCurrency)
  netWorth += investments.total
  if (!investments.allConverted) allConverted = false

  return {
    displayCurrency,
    netWorth: Math.round(netWorth * 100) / 100,
    fullyConverted: allConverted
  }
}

// Recomputes each account's balance from its ledger and reports any drift
// instead of silently correcting it, so a bug that skipped applyBalanceDelta
// somewhere gets noticed (design.md Risks/Trade-offs).
//
// Anchors from the account's most recent manual balance correction (see
// balance_adjustments / adjustBalance) when one exists, falling back to
// initial_balance otherwise — a manual correction is itself a trusted,
// known-correct checkpoint, so only ledger activity *after* it needs
// re-summing. The ledger itself now covers transactions, transfers, and
// account-linked investment buys/sells (previously only transactions),
// which is what made nearly every real account look "wrong" before: any
// transfer or linked investment purchase was invisible to this check.
const reconcileBalances = async (userId) => {
  const accounts = await listAccounts(userId, { includeArchived: true })
  const mismatches = []

  for (const account of accounts) {
    const anchorResult = await query(SQL.getLatestBalanceAdjustment, [account.id])
    const anchor = anchorResult.rows[0]
    const anchorBalance = anchor ? Number(anchor.balance_after) : Number(account.initial_balance)
    const anchorTime = anchor ? anchor.occurred_at : null

    const ledgerResult = await query(SQL.getLedgerDeltaForAccount, [account.id, anchorTime])
    const expectedBalance = anchorBalance + Number(ledgerResult.rows[0].ledger_delta)
    const storedBalance = Number(account.balance)
    if (Math.abs(expectedBalance - storedBalance) > 0.01) {
      mismatches.push({ accountId: account.id, storedBalance, expectedBalance })
      console.warn(`[alert] Account ${account.id} balance drift: stored=${storedBalance} expected=${expectedBalance}`)
    }
  }

  return { checked: accounts.length, mismatches }
}

module.exports = {
  ACCOUNT_TYPES,
  createAccount,
  getAccountById,
  listAccounts,
  applyBalanceDelta,
  adjustBalance,
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
  getNetWorth,
  getDisplayCurrency,
  setDisplayCurrency,
  getCycleStartDay,
  setCycleStartDay,
  getInvestmentsTotal,
  reconcileBalances,
  getActiveExchangeRates
}
