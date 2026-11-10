'use strict'
const router = require('express').Router()
const investmentsService = require('../services/investments')
const priceUpdates = require('../services/priceUpdates')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

// priceSource/priceSymbol (optional) link the new holding to a market listing
// so its price updates on its own from the start.
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {}
  let holding = await investmentsService.addHolding(req.userId, body)
  if (body.priceSource) holding = await priceUpdates.linkHolding(req.userId, holding.id, { source: body.priceSource, symbol: body.priceSymbol })
  res.status(201).json({ success: true, holding })
}))

// --- Automatic prices ---------------------------------------------------

router.get('/market/search', asyncHandler(async (req, res) => {
  const results = await priceUpdates.searchMarket(req.query.q, { currency: req.query.currency })
  res.json({ success: true, results })
}))

router.get('/market/suggestions', asyncHandler(async (req, res) => {
  const suggestions = await priceUpdates.suggestLinks(req.userId)
  res.json({ success: true, suggestions })
}))

router.post('/prices/refresh', asyncHandler(async (req, res) => {
  const result = await priceUpdates.refreshUserPrices(req.userId)
  res.json({ success: true, ...result })
}))

router.get('/:id/price-history', asyncHandler(async (req, res) => {
  const history = await priceUpdates.getPriceHistory(req.userId, Number(req.params.id))
  res.json({ success: true, ...history })
}))

router.put('/:id/price-source', asyncHandler(async (req, res) => {
  const holding = await priceUpdates.linkHolding(req.userId, Number(req.params.id), req.body || {})
  res.json({ success: true, holding })
}))

router.delete('/:id/price-source', asyncHandler(async (req, res) => {
  const holding = await priceUpdates.unlinkHolding(req.userId, Number(req.params.id))
  res.json({ success: true, holding })
}))

router.get('/performance', asyncHandler(async (req, res) => {
  const performance = await investmentsService.getPeriodPerformance(req.userId, { periodOffset: req.query.periodOffset, startDate: req.query.startDate, endDate: req.query.endDate })
  res.json({ success: true, ...performance })
}))

router.get('/portfolio', asyncHandler(async (req, res) => {
  const portfolio = await investmentsService.getPortfolio(req.userId)
  res.json({ success: true, ...portfolio })
}))

router.get('/history', asyncHandler(async (req, res) => {
  const history = await investmentsService.getHistory(req.userId, { holdingId: req.query.holdingId })
  res.json({ success: true, history })
}))

router.get('/holdings-history', asyncHandler(async (req, res) => {
  const result = await investmentsService.getHoldingsHistory(req.userId)
  res.json({ success: true, ...result })
}))

router.get('/transactions', asyncHandler(async (req, res) => {
  const transactions = await investmentsService.listTransactions(req.userId)
  res.json({ success: true, transactions })
}))

router.get('/:id/detail', asyncHandler(async (req, res) => {
  const holding = await investmentsService.getHoldingDetail(req.userId, Number(req.params.id))
  res.json({ success: true, holding })
}))

router.patch('/:id/price', asyncHandler(async (req, res) => {
  const holding = await investmentsService.updatePrice(req.userId, Number(req.params.id), req.body?.currentPrice)
  res.json({ success: true, holding })
}))

router.patch('/:id/name', asyncHandler(async (req, res) => {
  const holding = await investmentsService.renameHolding(req.userId, Number(req.params.id), req.body?.assetName)
  res.json({ success: true, holding })
}))

router.patch('/:id/category', asyncHandler(async (req, res) => {
  const holding = await investmentsService.setCategory(req.userId, Number(req.params.id), req.body?.category)
  res.json({ success: true, holding })
}))

router.patch('/:id/purchased-at', asyncHandler(async (req, res) => {
  const holding = await investmentsService.setPurchasedAt(req.userId, Number(req.params.id), req.body?.purchasedAt)
  res.json({ success: true, holding })
}))

router.post('/:id/add', asyncHandler(async (req, res) => {
  const holding = await investmentsService.addToHolding(req.userId, Number(req.params.id), req.body || {})
  res.json({ success: true, holding })
}))

router.post('/:id/remove', asyncHandler(async (req, res) => {
  const holding = await investmentsService.removeHolding(req.userId, Number(req.params.id), req.body || {})
  res.json({ success: true, holding })
}))

router.get('/allocation-targets', asyncHandler(async (req, res) => {
  const comparison = await investmentsService.getAllocationComparison(req.userId, { compareOffset: req.query.compareOffset })
  res.json({ success: true, ...comparison })
}))

router.put('/allocation-targets', asyncHandler(async (req, res) => {
  const comparison = await investmentsService.setAllocationTargets(req.userId, req.body?.targets, req.body?.targetCagr)
  res.json({ success: true, ...comparison })
}))

module.exports = router
