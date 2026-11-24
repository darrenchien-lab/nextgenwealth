'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { AppError, badRequest } = require('../shared/utils')
const { isValidCurrencyCode } = require('../shared/currencyCodes')
const accountsService = require('./accounts')
const categoriesService = require('./categories')
const ollama = require('../shared/ollama')

const SQL = { listOpenHoldings: loadSql('smartEntry/listOpenHoldings') }

// "Smart entry": the user types what they did in plain words and an AI model
// turns it into drafts (transactions, transfers, buys, sells). Nothing is
// saved here. The drafts go back to the page to be checked, and are saved
// through the same endpoints as the normal forms, so every existing rule applies.
//
// Only names go to the model (accounts, categories, holdings) and never
// balances or amounts from the user's data. The model runs on this machine
// (Ollama), so none of it is sent to an outside service.

const MAX_TEXT = 1000
const ASSET_TYPES = ['stock', 'mutual_fund', 'crypto', 'etf', 'bond', 'gold', 'property', 'other']
const LOT_SIZE = 100 // one lot on the Indonesian stock exchange is 100 shares

// --- Rate limit: keeps a shared free-tier key from being drained ----------
const PER_MINUTE = 6
const PER_DAY = 60
const usage = new Map() // userId -> timestamps (ms) of recent requests

const checkRateLimit = (userId, now = Date.now()) => {
  const recent = (usage.get(userId) || []).filter((t) => now - t < 24 * 60 * 60 * 1000)
  if (recent.length === 0) usage.delete(userId)
  if (recent.length >= PER_DAY) throw new AppError(429, 'TOO_MANY_REQUESTS', "You've used all your AI entries for today. Try again tomorrow, or add these manually.")
  if (recent.filter((t) => now - t < 60 * 1000).length >= PER_MINUTE) throw new AppError(429, 'TOO_MANY_REQUESTS', 'Please wait a moment, then try again.')
  recent.push(now)
  usage.set(userId, recent)
}

// --- The model call ----------------------------------------------------------
// A standard JSON Schema; Ollama forces the model's answer to fit it.
const nullable = (type, extra = {}) => ({ type: [type, 'null'], ...extra })
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['transaction', 'transfer', 'buy', 'sell'] },
          date: nullable('string'),
          amount: nullable('number'),
          txType: nullable('string', { enum: ['income', 'expense', null] }),
          account: nullable('string'),
          toAccount: nullable('string'),
          category: nullable('string'),
          notes: nullable('string'),
          assetName: nullable('string'),
          assetType: nullable('string', { enum: [...ASSET_TYPES, null] }),
          quantity: nullable('number'),
          quantityUnit: nullable('string', { enum: ['units', 'lot', null] }),
          price: nullable('number'),
          currency: nullable('string')
        },
        // Every field is required (and may be null) so the model has to decide on each one
        // instead of leaving out the amount.
        required: ['kind', 'date', 'amount', 'txType', 'account', 'toAccount', 'category', 'notes', 'assetName', 'assetType', 'quantity', 'quantityUnit', 'price', 'currency']
      }
    }
  },
  required: ['actions']
}

const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const buildInstruction = ({ today, context }) => [
  'You turn a person\'s plain-language notes about their money into structured entries for a personal finance app. The person writes in Indonesian, English or a mix.',
  `Today is ${dateKey(today)} (${today.toLocaleDateString('en-US', { weekday: 'long' })}). Give every date as YYYY-MM-DD. "kemarin"/"yesterday" is the day before today, "tadi"/"today" is today. If no date is given, use null.`,
  'Kinds: "transaction" (income or expense; set txType), "transfer" (money moved between two of the person\'s accounts; set account = from, toAccount = to), "buy" and "sell" (investments: set assetName, assetType, quantity, price per unit, and amount = the total paid or received if stated).',
  'Amounts are plain numbers in the currency given or implied, never strings. Indonesian shorthand: "rb"/"ribu"/"k" = x1,000; "jt"/"juta" = x1,000,000; "miliar"/"M" = x1,000,000,000; "10.000" in Indonesian text means ten thousand.',
  'For stocks quoted in lots ("10 lot"), set quantity to 10 and quantityUnit to "lot". Otherwise quantityUnit is "units". Never convert lots yourself.',
  'account/toAccount/category must be copied from these lists when something matches; otherwise leave null. Do not invent names or amounts, and use null for anything not stated.',
  'One entry per distinct activity. If nothing in the text is a financial activity, return an empty actions list.',
  `Accounts: ${context.accounts.map((a) => `${a.name} (${a.currency})`).join('; ') || 'none'}`,
  `Categories: ${context.categories.map((c) => c.name).join('; ') || 'none'}`,
  `Existing holdings: ${context.holdings.map((h) => h.asset_name).join('; ') || 'none'}`
].join('\n')

const askModel = ({ system, text }) => ollama.callModel({ system, text, schema: RESPONSE_SCHEMA })

// --- Turning the model's words into checked drafts ---------------------------
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

// One item whose name matches: exactly, or by one containing the other.
// Returns { item } or { issue }.
const findByName = (items, name, getName, label) => {
  const wanted = normalize(name)
  if (!wanted) return {}
  const exact = items.filter((i) => normalize(getName(i)) === wanted)
  if (exact.length === 1) return { item: exact[0] }
  const loose = exact.length > 1 ? exact : items.filter((i) => {
    const have = normalize(getName(i))
    return have && (have.includes(wanted) || wanted.includes(have))
  })
  if (loose.length === 1) return { item: loose[0] }
  if (loose.length > 1) return { issue: `"${name}" could mean more than one ${label}. Please pick one.` }
  return { issue: `We couldn't find ${label === 'account' ? 'an' : 'a'} ${label} called "${name}".` }
}

const positive = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null)
const round2 = (n) => Math.round(n * 100) / 100

const resolveDate = (value, today, issues) => {
  if (value === null || value === undefined || value === '') return dateKey(today)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  const parsed = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
  if (!parsed || dateKey(parsed) !== value) {
    issues.push("We couldn't tell the date, so we used today.")
    return dateKey(today)
  }
  if (value > dateKey(today)) {
    issues.push("That date hasn't happened yet, so we used today.")
    return dateKey(today)
  }
  return value
}

const resolveDrafts = (raw, context, today) => {
  const actions = Array.isArray(raw?.actions) ? raw.actions.slice(0, 20) : []
  const onlyAccount = context.accounts.length === 1 ? context.accounts[0] : null

  return actions.map((a, index) => {
    const issues = []
    const base = { id: `draft-${index}`, kind: a.kind, date: resolveDate(a.date, today, issues), issues }
    const pickAccount = (name) => {
      if (!name) return onlyAccount
      const { item, issue } = findByName(context.accounts, name, (x) => x.name, 'account')
      if (issue) issues.push(issue)
      return item || null
    }

    if (a.kind === 'transaction') {
      const account = pickAccount(a.account)
      const { item: category, issue } = a.category ? findByName(context.categories, a.category, (c) => c.name, 'category') : {}
      if (issue) issues.push(issue)
      const amount = positive(a.amount)
      if (!amount) issues.push("We couldn't find an amount.")
      return { ...base, type: a.txType === 'income' ? 'income' : 'expense', amount, accountId: account?.id ?? null, categoryId: category?.id ?? null, notes: a.notes || '' }
    }

    if (a.kind === 'transfer') {
      const from = pickAccount(a.account)
      const { item: to, issue } = a.toAccount ? findByName(context.accounts, a.toAccount, (x) => x.name, 'account') : {}
      if (issue) issues.push(issue)
      const amount = positive(a.amount)
      if (!amount) issues.push("We couldn't find an amount.")
      if (!to && !issue) issues.push('Which account is it going to?')
      return { ...base, amount, fromAccountId: from?.id ?? null, toAccountId: to?.id ?? null, notes: a.notes || '' }
    }

    if (a.kind === 'buy' || a.kind === 'sell') {
      const { item: holding } = a.assetName ? findByName(context.holdings, a.assetName, (h) => h.asset_name, 'holding') : {}
      const account = a.account ? pickAccount(a.account) : null
      let quantity = positive(a.quantity)
      if (quantity && a.quantityUnit === 'lot') quantity = quantity * LOT_SIZE
      let price = positive(a.price)
      let total = positive(a.amount)
      // A small local model is unreliable at arithmetic (and never sees the lot conversion),
      // so when quantity and price are both known the total is worked out here.
      if (quantity && price) total = round2(quantity * price)
      if (quantity && total && !price) price = total / quantity
      if (!a.assetName && !holding) issues.push("We couldn't tell which asset this is.")
      if (!quantity) issues.push("We couldn't find how many.")
      if (!price && !total) issues.push("We couldn't find the price.")
      if (a.kind === 'sell' && !holding) issues.push(`You don't have any "${a.assetName || 'this asset'}" to sell.`)

      const assetType = ASSET_TYPES.includes(a.assetType) ? a.assetType : (holding?.asset_type || 'stock')
      let currency = holding?.currency || account?.currency || (isValidCurrencyCode(a.currency) ? String(a.currency).toUpperCase() : context.displayCurrency)
      return {
        ...base, assetName: holding?.asset_name || a.assetName || '', assetType, holdingId: holding?.id ?? null,
        quantity, price: price ? round2(price * 1e4) / 1e4 : null, total, currency, accountId: account?.id ?? null
      }
    }

    return null
  }).filter(Boolean)
}

const loadContext = async (userId) => {
  const [accounts, categories, holdings, displayCurrency] = await Promise.all([
    accountsService.listAccounts(userId),
    categoriesService.listCategories(userId),
    query(SQL.listOpenHoldings, [userId]).then((r) => r.rows),
    accountsService.getDisplayCurrency(userId)
  ])
  return { accounts, categories, holdings, displayCurrency }
}

// callModel can be swapped out (tests).
const parse = async (userId, text, { callModel = askModel, now = new Date() } = {}) => {
  if (typeof text !== 'string' || text.trim() === '') throw badRequest('Tell us what happened first.')
  if (text.length > MAX_TEXT) throw badRequest(`That's a bit long. Please keep it under ${MAX_TEXT} characters.`)

  checkRateLimit(userId)
  const context = await loadContext(userId)
  let raw
  try {
    raw = await callModel({ system: buildInstruction({ today: now, context }), text: text.trim() })
  } catch (err) {
    // A call that failed on our side doesn't use up one of the person's tries.
    usage.set(userId, (usage.get(userId) || []).slice(0, -1))
    throw err
  }
  const drafts = resolveDrafts(raw, context, now)

  return {
    drafts,
    context: {
      displayCurrency: context.displayCurrency,
      accounts: context.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
      categories: context.categories.map((c) => ({ id: c.id, name: c.name })),
      holdings: context.holdings.map((h) => ({ id: h.id, name: h.asset_name, currency: h.currency }))
    }
  }
}

module.exports = { parse, resolveDrafts, checkRateLimit, askModel, buildInstruction, MAX_TEXT }
