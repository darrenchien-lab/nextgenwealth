'use strict'
const router = require('express').Router()
const transfersService = require('../services/transfers')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.post('/', asyncHandler(async (req, res) => {
  const transfer = await transfersService.createTransfer(req.userId, req.body || {})
  res.status(201).json({ success: true, transfer })
}))

router.get('/', asyncHandler(async (req, res) => {
  const transfers = await transfersService.listTransfers(req.userId)
  res.json({ success: true, transfers })
}))

router.post('/:id/reverse', asyncHandler(async (req, res) => {
  const reversal = await transfersService.reverseTransfer(req.userId, Number(req.params.id))
  res.status(201).json({ success: true, reversal })
}))

module.exports = router
