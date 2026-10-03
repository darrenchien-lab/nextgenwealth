'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, notFound } = require('../shared/utils')

const SQL = {
  create: loadSql('categories/create'),
  getById: loadSql('categories/getById'),
  list: loadSql('categories/list')
}

const createCategory = async (userId, { name, parentCategoryId }) => {
  if (typeof name !== 'string' || name.trim() === '') throw badRequest('Category name is required')

  if (parentCategoryId !== undefined && parentCategoryId !== null) {
    const parent = await getCategoryById(userId, parentCategoryId)
    if (!parent) throw badRequest('parentCategoryId does not reference a valid category')
  }

  const result = await query(SQL.create, [userId, name.trim(), parentCategoryId || null])
  return result.rows[0]
}

// Categories with a NULL user_id are shared defaults available to everyone;
// anything else must belong to the requesting user.
const getCategoryById = async (userId, categoryId) => {
  const result = await query(SQL.getById, [categoryId])
  const category = result.rows[0]
  if (!category || (category.user_id !== null && category.user_id !== userId)) {
    return null
  }
  return category
}

const requireCategory = async (userId, categoryId) => {
  const category = await getCategoryById(userId, categoryId)
  if (!category) throw notFound('Category not found')
  return category
}

const listCategories = async (userId) => {
  const result = await query(SQL.list, [userId])
  return result.rows
}

module.exports = { createCategory, getCategoryById, requireCategory, listCategories }
