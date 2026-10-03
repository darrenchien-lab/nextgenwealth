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
  const { startDate, endDate, categoryId } = req.query
  const breakdown = await reportsService.getExpenseBreakdown(req.userId, {
    startDate,
    endDate,
    categoryId: categoryId ? Number(categoryId) : undefined
  })
  res.json({ success: true, ...breakdown })
}))

router.get('/trends', asyncHandler(async (req, res) => {
  const months = Number(req.query.months || 6)
  const trends = await reportsService.getTrends(req.userId, months)
  res.json({ success: true, trends })
}))

router.get('/asset-allocation', asyncHandler(async (req, res) => {
  const allocation = await reportsService.getAssetAllocation(req.userId)
  res.json({ success: true, ...allocation })
}))

router.get('/net-worth-history', asyncHandler(async (req, res) => {
  const history = await reportsService.getNetWorthHistory(req.userId)
  res.json({ success: true, history })
}))

router.get('/export', asyncHandler(async (req, res) => {
  // eslint-disable-next-line no-unused-vars
  const { changes, periodOffset, ...summary } = await reportsService.getDashboardSummary(req.userId, req.query)
  const { buffer, contentType, filename } = await reportExportService.exportReport(req.query.format, summary)
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buffer)
}))

module.exports = router
