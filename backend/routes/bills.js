'use strict'
const router = require('express').Router()
const billsService = require('../services/bills')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.post('/', asyncHandler(async (req, res) => {
  const bill = await billsService.createBill(req.userId, req.body || {})
  res.status(201).json({ success: true, bill })
}))

router.get('/upcoming', asyncHandler(async (req, res) => {
  const windowDays = req.query.windowDays ? Number(req.query.windowDays) : undefined
  const bills = await billsService.listUpcomingBills(req.userId, windowDays)
  const { total, displayCurrency, hasUnconverted } = await billsService.getUpcomingBillsTotal(req.userId, windowDays)
  res.json({ success: true, bills, total, displayCurrency, hasUnconverted })
}))

router.get('/', asyncHandler(async (req, res) => {
  const bills = await billsService.listAllBills(req.userId)
  res.json({ success: true, bills })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const bill = await billsService.updateBill(req.userId, Number(req.params.id), req.body || {})
  res.json({ success: true, bill })
}))

router.post('/:id/pay', asyncHandler(async (req, res) => {
  const bill = await billsService.payBill(req.userId, Number(req.params.id))
  res.json({ success: true, bill })
}))

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const bill = await billsService.cancelBill(req.userId, Number(req.params.id))
  res.json({ success: true, bill })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await billsService.deleteBill(req.userId, Number(req.params.id))
  res.json({ success: true })
}))

module.exports = router
