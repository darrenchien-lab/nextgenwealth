'use strict'
const { query, withTransaction } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest, assertOwned } = require('../shared/utils')

const SQL = {
  create: loadSql('savingsGoals/create'),
  getById: loadSql('savingsGoals/getById'),
  insertContribution: loadSql('savingsGoals/insertContribution'),
  increaseSavedAmount: loadSql('savingsGoals/increaseSavedAmount'),
  decreaseSavedAmount: loadSql('savingsGoals/decreaseSavedAmount'),
  delete: loadSql('savingsGoals/delete'),
  list: loadSql('savingsGoals/list')
}

const createGoal = async (userId, { name, targetAmount, targetDate, accountId }) => {
  if (typeof name !== 'string' || name.trim() === '') throw badRequest('Goal name is required')
  const numericTarget = Number(targetAmount)
  if (!(numericTarget > 0)) throw badRequest('targetAmount must be a positive number')

  const result = await query(SQL.create, [userId, name.trim(), numericTarget, targetDate || null, accountId || null])
  return result.rows[0]
}

const getGoalById = async (userId, id) => {
  const result = await query(SQL.getById, [id])
  return assertOwned(result.rows[0], userId, 'Savings goal not found')
}

const contribute = async (userId, id, amount) => {
  const numericAmount = Number(amount)
  if (!(numericAmount > 0)) throw badRequest('Contribution amount must be a positive number')
  const goal = await getGoalById(userId, id)

  return withTransaction(async (client) => {
    await client.query(SQL.insertContribution, [goal.id, numericAmount])
    const result = await client.query(SQL.increaseSavedAmount, [numericAmount, goal.id])
    return result.rows[0]
  })
}

const withdraw = async (userId, id, amount) => {
  const numericAmount = Number(amount)
  if (!(numericAmount > 0)) throw badRequest('Withdrawal amount must be a positive number')
  const goal = await getGoalById(userId, id)
  if (numericAmount > Number(goal.saved_amount)) {
    throw badRequest('Withdrawal amount exceeds the amount saved toward this goal')
  }

  return withTransaction(async (client) => {
    await client.query(SQL.insertContribution, [goal.id, -numericAmount])
    const result = await client.query(SQL.decreaseSavedAmount, [numericAmount, goal.id])
    return result.rows[0]
  })
}

const deleteGoal = async (userId, id) => {
  const goal = await getGoalById(userId, id)
  await query(SQL.delete, [goal.id])
}

const listGoals = async (userId) => {
  const result = await query(SQL.list, [userId])
  return result.rows.map((goal) => {
    const progressPercentage = Math.round((Number(goal.saved_amount) / Number(goal.target_amount)) * 1000) / 10
    return {
      ...goal,
      progressPercentage,
      isComplete: Number(goal.saved_amount) >= Number(goal.target_amount)
    }
  })
}

module.exports = { createGoal, getGoalById, contribute, withdraw, deleteGoal, listGoals }
