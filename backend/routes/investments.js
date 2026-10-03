'use strict'
const router = require('express').Router()
const investmentsService = require('../services/investments')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.post('/', asyncHandler(async (req, res) => {
  const holding = await investmentsService.addHolding(req.userId, req.body || {})
  res.status(201).json({ success: true, holding })
}))

router.get('/portfolio', asyncHandler(async (req, res) => {
  const portfolio = await investmentsService.getPortfolio(req.userId)
  res.json({ success: true, ...portfolio })
}))

router.get('/history', asyncHandler(async (req, res) => {
  const history = await investmentsService.getHistory(req.userId)
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
  const holding = await investmentsService.removeHolding(req.userId, Number(req.params.id), req.body?.quantity)
  res.json({ success: true, holding })
}))

router.get('/allocation-targets', asyncHandler(async (req, res) => {
  const comparison = await investmentsService.getAllocationComparison(req.userId)
  res.json({ success: true, ...comparison })
}))

router.put('/allocation-targets', asyncHandler(async (req, res) => {
  const comparison = await investmentsService.setAllocationTargets(req.userId, req.body?.targets, req.body?.targetCagr)
  res.json({ success: true, ...comparison })
}))

module.exports = router
