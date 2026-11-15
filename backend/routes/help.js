'use strict'
const router = require('express').Router()
const helpAssistant = require('../services/helpAssistant')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.post('/ask', asyncHandler(async (req, res) => {
  const { question, history } = req.body || {}
  const result = await helpAssistant.ask(req.userId, question, history)
  res.json({ success: true, ...result })
}))

module.exports = router
