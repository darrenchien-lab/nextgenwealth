'use strict'
const router = require('express').Router()
const goalsService = require('../services/savingsGoals')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.post('/', asyncHandler(async (req, res) => {
  const goal = await goalsService.createGoal(req.userId, req.body || {})
  res.status(201).json({ success: true, goal })
}))

router.get('/', asyncHandler(async (req, res) => {
  const goals = await goalsService.listGoals(req.userId)
  res.json({ success: true, goals })
}))

router.post('/:id/contribute', asyncHandler(async (req, res) => {
  const goal = await goalsService.contribute(req.userId, Number(req.params.id), req.body?.amount)
  res.json({ success: true, goal })
}))

router.post('/:id/withdraw', asyncHandler(async (req, res) => {
  const goal = await goalsService.withdraw(req.userId, Number(req.params.id), req.body?.amount)
  res.json({ success: true, goal })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await goalsService.deleteGoal(req.userId, Number(req.params.id))
  res.json({ success: true })
}))

module.exports = router
