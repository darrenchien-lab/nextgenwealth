'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { badRequest } = require('../shared/utils')
const aggregates = require('../shared/financialAggregates')
const savingsGoalsService = require('./savingsGoals')

const SQL = {
  hasAnyTransactions: loadSql('insights/hasAnyTransactions'),
  getSettings: loadSql('insights/getSettings'),
  upsertSettings: loadSql('insights/upsertSettings'),
  saveExternalAiInsights: loadSql('insights/saveExternalAiInsights'),
  saveRuleBasedInsights: loadSql('insights/saveRuleBasedInsights'),
  listAllUserIds: loadSql('insights/listAllUserIds')
}

const PROVIDERS = ['rule_based', 'external_ai']

const monthRange = (offsetMonths = 0) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0, 23, 59, 59)
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}

const hasAnyTransactions = async (userId) => {
  const result = await query(SQL.hasAnyTransactions, [userId])
  return result.rowCount > 0
}

const getSettings = async (userId) => {
  const result = await query(SQL.getSettings, [userId])
  return result.rows[0] || { user_id: userId, active_provider: 'rule_based', provider_config: {}, last_insights: null }
}

const upsertSettings = async (userId, { activeProvider, providerConfig }) => {
  if (!PROVIDERS.includes(activeProvider)) throw badRequest(`activeProvider must be one of: ${PROVIDERS.join(', ')}`)
  if (activeProvider === 'external_ai' && !providerConfig?.apiKey) {
    throw badRequest('providerConfig.apiKey is required for the external_ai provider')
  }

  const result = await query(SQL.upsertSettings, [userId, activeProvider, JSON.stringify(providerConfig || {})])
  return result.rows[0]
}

// The default provider: derives a handful of plain-language statements
// straight from the same aggregates `reports` uses, so numbers never
// disagree between the dashboard and this text (design.md Decision 6/7).
const generateRuleBasedInsights = async (userId) => {
  const insights = []

  const breakdown = await aggregates.getExpenseBreakdown(userId, monthRange(0))
  if (breakdown.breakdown.length > 0) {
    const top = [...breakdown.breakdown].sort((a, b) => b.amount - a.amount)[0]
    insights.push(`Your top spending category this month is ${top.categoryName} at ${top.percentage}% of expenses.`)
  }

  const [current, previous] = await Promise.all([
    aggregates.getIncomeExpense(userId, monthRange(0)),
    aggregates.getIncomeExpense(userId, monthRange(-1))
  ])
  if (current.income > 0 && previous.income > 0) {
    const currentRate = (current.income - current.expense) / current.income
    const previousRate = (previous.income - previous.expense) / previous.income
    const delta = Math.round((currentRate - previousRate) * 1000) / 10
    if (delta > 0) insights.push(`Your savings rate improved by ${delta} percentage points versus last month.`)
    else if (delta < 0) insights.push(`Your savings rate dropped by ${Math.abs(delta)} percentage points versus last month.`)
  }

  const goals = await savingsGoalsService.listGoals(userId)
  const nearingCompletion = goals.find((g) => !g.isComplete && g.progressPercentage >= 80)
  if (nearingCompletion) {
    insights.push(`You're ${nearingCompletion.progressPercentage}% of the way to your "${nearingCompletion.name}" goal — almost there!`)
  }

  return insights
}

const generateExternalAiInsights = async (userId, providerConfig) => {
  const snapshot = {
    dashboard: await aggregates.getIncomeExpense(userId, monthRange(0)),
    breakdown: await aggregates.getExpenseBreakdown(userId, monthRange(0))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(providerConfig.apiUrl || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${providerConfig.apiKey}` },
      body: JSON.stringify({ snapshot }),
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`External AI provider returned HTTP ${response.status}`)
    const data = await response.json()
    return Array.isArray(data.insights) ? data.insights : [String(data.insight || data.result || '')]
  } finally {
    clearTimeout(timeout)
  }
}

const getInsights = async (userId) => {
  if (!(await hasAnyTransactions(userId))) {
    return {
      insights: ["Welcome to NextGen Wealth! Add your first transaction to start getting personalized insights."],
      source: 'starter'
    }
  }

  const settings = await getSettings(userId)

  if (settings.active_provider === 'external_ai') {
    try {
      const insights = await generateExternalAiInsights(userId, settings.provider_config)
      await query(SQL.saveExternalAiInsights, [userId, JSON.stringify(settings.provider_config), JSON.stringify(insights)])
      return { insights, source: 'external_ai' }
    } catch (err) {
      console.error('External AI insight provider failed, falling back:', err.message)
      if (settings.last_insights) {
        return { insights: settings.last_insights, source: 'external_ai_fallback_cached' }
      }
      // No cached insights yet either — fall through to the rule-based provider.
    }
  }

  const insights = await generateRuleBasedInsights(userId)
  await query(SQL.saveRuleBasedInsights, [userId, settings.active_provider, JSON.stringify(settings.provider_config || {}), JSON.stringify(insights)])
  return { insights, source: 'rule_based' }
}

const refreshAllUsersInsights = async () => {
  const users = await query(SQL.listAllUserIds)
  for (const user of users.rows) {
    try {
      await getInsights(user.id)
    } catch (err) {
      console.error(`Failed to refresh insights for user ${user.id}:`, err.message)
    }
  }
}

module.exports = { getSettings, upsertSettings, getInsights, refreshAllUsersInsights, PROVIDERS }
