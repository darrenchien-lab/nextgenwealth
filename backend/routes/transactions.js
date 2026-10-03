'use strict'
const router = require('express').Router()
const transactionsService = require('../services/transactions')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {}
  const transaction = body.recurrence
    ? await transactionsService.createRecurringTransaction(req.userId, body)
    : await transactionsService.createTransaction(req.userId, body)
  res.status(201).json({ success: true, transaction })
}))

router.get('/', asyncHandler(async (req, res) => {
  const { startDate, endDate, accountId, categoryId, type } = req.query
  const transactions = await transactionsService.listTransactions(req.userId, {
    startDate,
    endDate,
    accountId: accountId ? Number(accountId) : undefined,
    categoryId: categoryId ? Number(categoryId) : undefined,
    type
  })
  res.json({ success: true, transactions })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const transaction = await transactionsService.updateTransaction(req.userId, Number(req.params.id), req.body || {})
  res.json({ success: true, transaction })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  await transactionsService.deleteTransaction(req.userId, Number(req.params.id))
  res.json({ success: true })
}))

router.post('/:id/split', asyncHandler(async (req, res) => {
  const transactions = await transactionsService.splitTransaction(req.userId, Number(req.params.id), req.body?.splits)
  res.status(201).json({ success: true, transactions })
}))

module.exports = router
