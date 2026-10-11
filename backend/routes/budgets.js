'use strict'
const router = require('express').Router()
const budgetsService = require('../services/budgets')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.post('/', asyncHandler(async (req, res) => {
  const budget = await budgetsService.createBudget(req.userId, req.body || {})
  res.status(201).json({ success: true, budget })
}))

router.get('/', asyncHandler(async (req, res) => {
  // currentPeriod lets the page tell whether it is showing the cycle in
  // progress or browsing an earlier/later one.
  const current = await budgetsService.describePeriod(req.userId)
  const { period, periodLabel } = req.query.period ? await budgetsService.describePeriod(req.userId, req.query.period) : current
  const budgets = await budgetsService.listBudgetsWithUsage(req.userId, period)
  res.json({ success: true, period, periodLabel, currentPeriod: current.period, budgets })
}))

router.get('/:id/forecast', asyncHandler(async (req, res) => {
  const forecast = await budgetsService.getForecast(req.userId, Number(req.params.id))
  res.json({ success: true, ...forecast })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const budget = await budgetsService.updateBudget(req.userId, Number(req.params.id), req.body || {})
  res.json({ success: true, budget })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await budgetsService.deleteBudget(req.userId, Number(req.params.id))
  res.json({ success: true })
}))

module.exports = router
