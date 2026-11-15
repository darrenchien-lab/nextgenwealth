'use strict'
const router = require('express').Router()
const insightsService = require('../services/insights')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.get('/', asyncHandler(async (req, res) => {
  const result = await insightsService.getInsights(req.userId)
  res.json({ success: true, ...result })
}))

router.get('/config', asyncHandler(async (req, res) => {
  const settings = await insightsService.getSettings(req.userId)
  res.json({ success: true, ...insightsService.publicConfig(settings) })
}))

router.get('/summary', asyncHandler(async (req, res) => {
  const result = await insightsService.getSummary(req.userId)
  res.json({ success: true, ...result })
}))

router.put('/preferences', asyncHandler(async (req, res) => {
  const settings = await insightsService.setAiSummary(req.userId, !!(req.body || {}).aiSummary)
  res.json({ success: true, ...insightsService.publicConfig(settings) })
}))

module.exports = router
