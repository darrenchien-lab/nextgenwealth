'use strict'
const router = require('express').Router()
const accountsService = require('../services/accounts')
const currencyService = require('../services/currency')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.get('/supported-currencies', asyncHandler(async (req, res) => {
  const currencies = await currencyService.getSupportedCurrencies()
  res.json({ success: true, currencies })
}))

router.get('/exchange-rates', asyncHandler(async (req, res) => {
  const result = await accountsService.getActiveExchangeRates(req.userId)
  res.json({ success: true, ...result })
}))

// Manual on-demand refresh — fetches fresh rates right now instead of
// waiting for the daily cron/startup catch-up, for a user who wants the
// latest rate before an important conversion (e.g. logging a transfer).
router.post('/exchange-rates/refresh', asyncHandler(async (req, res) => {
  const fetchResult = await currencyService.fetchAndCacheDailyRates()
  if (!fetchResult.success) {
    return res.status(502).json({ success: false, code: 'RATE_FETCH_FAILED', message: 'Could not reach the exchange rate provider — please try again in a moment.' })
  }
  const result = await accountsService.getActiveExchangeRates(req.userId)
  res.json({ success: true, ...result })
}))

router.post('/', asyncHandler(async (req, res) => {
  const account = await accountsService.createAccount(req.userId, req.body || {})
  res.status(201).json({ success: true, account })
}))

router.get('/', asyncHandler(async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true'
  const accounts = await accountsService.listAccounts(req.userId, { includeArchived })
  res.json({ success: true, accounts })
}))

router.get('/:id/statement', asyncHandler(async (req, res) => {
  const statement = await accountsService.getStatement(req.userId, Number(req.params.id), {
    startDate: req.query.startDate,
    endDate: req.query.endDate
  })
  res.json({ success: true, ...statement })
}))

router.get('/net-worth', asyncHandler(async (req, res) => {
  const netWorth = await accountsService.getNetWorth(req.userId)
  res.json({ success: true, ...netWorth })
}))

router.get('/display-currency', asyncHandler(async (req, res) => {
  const displayCurrency = await accountsService.getDisplayCurrency(req.userId)
  res.json({ success: true, displayCurrency })
}))

router.put('/display-currency', asyncHandler(async (req, res) => {
  const result = await accountsService.setDisplayCurrency(req.userId, req.body?.currency)
  res.json({ success: true, ...result })
}))

router.get('/cycle-start-day', asyncHandler(async (req, res) => {
  const cycleStartDay = await accountsService.getCycleStartDay(req.userId)
  res.json({ success: true, cycleStartDay })
}))

router.put('/cycle-start-day', asyncHandler(async (req, res) => {
  const result = await accountsService.setCycleStartDay(req.userId, req.body?.cycleStartDay)
  res.json({ success: true, ...result })
}))

router.patch('/:id/adjust', asyncHandler(async (req, res) => {
  const account = await accountsService.adjustBalance(req.userId, Number(req.params.id), Number(req.body?.delta))
  res.json({ success: true, account })
}))

router.post('/:id/archive', asyncHandler(async (req, res) => {
  const account = await accountsService.archiveAccount(req.userId, Number(req.params.id))
  res.json({ success: true, account })
}))

router.post('/:id/unarchive', asyncHandler(async (req, res) => {
  const account = await accountsService.unarchiveAccount(req.userId, Number(req.params.id))
  res.json({ success: true, account })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await accountsService.deleteAccount(req.userId, Number(req.params.id))
  res.json({ success: true })
}))

router.post('/reconcile', asyncHandler(async (req, res) => {
  const result = await accountsService.reconcileBalances(req.userId)
  res.json({ success: true, ...result })
}))

module.exports = router
