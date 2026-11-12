'use strict'
const router = require('express').Router()
const reportsService = require('../services/reports')
const reportExportService = require('../services/reportExport')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.get('/dashboard', asyncHandler(async (req, res) => {
  const summary = await reportsService.getDashboardSummary(req.userId, req.query)
  res.json({ success: true, ...summary })
}))

router.get('/cash-flow', asyncHandler(async (req, res) => {
  const cashFlow = await reportsService.getCashFlow(req.userId, req.query)
  res.json({ success: true, ...cashFlow })
}))

router.get('/expense-breakdown', asyncHandler(async (req, res) => {
  const { startDate, endDate, categoryId, periodOffset } = req.query
  const breakdown = await reportsService.getExpenseBreakdown(req.userId, {
    startDate,
    endDate,
    categoryId: categoryId ? Number(categoryId) : undefined,
    periodOffset
  })
  res.json({ success: true, ...breakdown })
}))

router.get('/compare-cycles', asyncHandler(async (req, res) => {
  const comparison = await reportsService.getCycleComparison(req.userId, { a: req.query.a, b: req.query.b })
  res.json({ success: true, ...comparison })
}))

router.get('/currency-exposure', asyncHandler(async (req, res) => {
  const exposure = await reportsService.getCurrencyExposure(req.userId, { sinceOffset: req.query.sinceOffset })
  res.json({ success: true, ...exposure })
}))

router.get('/cycle-trend', asyncHandler(async (req, res) => {
  const trend = await reportsService.getCycleTrend(req.userId, { periodOffset: req.query.periodOffset, budgeted: req.query.budgeted === '1' })
  res.json({ success: true, ...trend })
}))

router.get('/net-worth-cycle', asyncHandler(async (req, res) => {
  const trend = await reportsService.getNetWorthCycleTrend(req.userId, { periodOffset: req.query.periodOffset })
  res.json({ success: true, ...trend })
}))

router.get('/trends', asyncHandler(async (req, res) => {
  const months = Number(req.query.months || 6)
  const trends = await reportsService.getTrends(req.userId, months)
  res.json({ success: true, trends })
}))

router.get('/asset-allocation', asyncHandler(async (req, res) => {
  const allocation = await reportsService.getAssetAllocation(req.userId, { periodOffset: req.query.periodOffset })
  res.json({ success: true, ...allocation })
}))

router.get('/net-worth-history', asyncHandler(async (req, res) => {
  const history = await reportsService.getNetWorthHistory(req.userId)
  res.json({ success: true, history })
}))

router.get('/export', asyncHandler(async (req, res) => {
  const { buffer, contentType, filename } = await reportExportService.exportReport(req.userId, { format: req.query.format, periodOffset: req.query.periodOffset })
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buffer)
}))

module.exports = router
