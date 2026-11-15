'use strict'
const router = require('express').Router()
const smartEntryService = require('../services/smartEntry')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

// Reads a plain-language note into drafts. Nothing is saved here.
router.post('/parse', asyncHandler(async (req, res) => {
  const result = await smartEntryService.parse(req.userId, (req.body || {}).text)
  res.json({ success: true, ...result })
}))

module.exports = router
