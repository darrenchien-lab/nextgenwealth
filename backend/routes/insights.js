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
  res.json({ success: true, activeProvider: settings.active_provider, providerConfig: settings.provider_config })
}))

router.put('/config', asyncHandler(async (req, res) => {
  const { activeProvider, providerConfig } = req.body || {}
  const settings = await insightsService.upsertSettings(req.userId, { activeProvider, providerConfig })
  res.json({ success: true, activeProvider: settings.active_provider, providerConfig: settings.provider_config })
}))

module.exports = router
