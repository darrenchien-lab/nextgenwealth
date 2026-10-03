'use strict'
const router = require('express').Router()
const categoriesService = require('../services/categories')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.use(requireAuth)

router.post('/', asyncHandler(async (req, res) => {
  const category = await categoriesService.createCategory(req.userId, req.body || {})
  res.status(201).json({ success: true, category })
}))

router.get('/', asyncHandler(async (req, res) => {
  const categories = await categoriesService.listCategories(req.userId)
  res.json({ success: true, categories })
}))

module.exports = router
