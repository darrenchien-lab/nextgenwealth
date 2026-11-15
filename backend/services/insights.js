'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const insightRules = require('./insightRules')
const insightSummary = require('./insightSummary')

const SQL = {
  hasAnyTransactions: loadSql('insights/hasAnyTransactions'),
  getSettings: loadSql('insights/getSettings'),
  upsertSettings: loadSql('insights/upsertSettings'),
  saveRuleBasedInsights: loadSql('insights/saveRuleBasedInsights'),
  listAllUserIds: loadSql('insights/listAllUserIds')
}

// Findings made a moment ago, so the Insights page (which asks for the
// findings and then for the summary of them) doesn't run the whole engine twice.
const RECENT_MS = 15 * 1000
const recent = new Map() // userId -> { items, at }

const hasAnyTransactions = async (userId) => {
  const result = await query(SQL.hasAnyTransactions, [userId])
  return result.rowCount > 0
}

const getSettings = async (userId) => {
  const result = await query(SQL.getSettings, [userId])
  return result.rows[0] || { user_id: userId, active_provider: 'rule_based', provider_config: {}, last_insights: null }
}

// What the page may see of the saved settings.
const publicConfig = (settings) => ({ aiSummary: !!settings.provider_config?.aiSummary })

// Turns the personal summary on or off. It is the only setting there is.
const setAiSummary = async (userId, enabled) => {
  const settings = await getSettings(userId)
  const config = { ...(settings.provider_config || {}), aiSummary: !!enabled }
  const result = await query(SQL.upsertSettings, [userId, 'rule_based', JSON.stringify(config)])
  return result.rows[0]
}

const asItems = (texts) => texts.map((text, i) => ({ id: `text-${i}`, tone: 'info', title: null, text, href: null }))

// The findings for the current cycle. Always worked out fresh.
const getInsights = async (userId) => {
  if (!(await hasAnyTransactions(userId))) {
    const text = 'Welcome to NextGen Wealth! Add your first transaction to start getting personalized insights.'
    return { insights: [text], items: asItems([text]), headline: null, source: 'starter' }
  }

  const settings = await getSettings(userId)
  const items = await insightRules.generate(userId)
  const insights = items.map((item) => (item.title ? `${item.title}. ${item.text}` : item.text))
  await query(SQL.saveRuleBasedInsights, [userId, 'rule_based', JSON.stringify(settings.provider_config || {}), JSON.stringify(insights)])
  recent.set(userId, { items, at: Date.now() })
  return { insights, items, headline: insightRules.headline(items), source: 'rule_based' }
}

// The short AI-written paragraph, only when the person asked for it. null
// when it is off, there is nothing to say, or the AI could not be reached.
const getSummary = async (userId) => {
  const settings = await getSettings(userId)
  if (!settings.provider_config?.aiSummary) return { enabled: false, summary: null }
  try {
    const seen = recent.get(userId)
    const items = seen && Date.now() - seen.at < RECENT_MS ? seen.items : (await getInsights(userId)).items
    return { enabled: true, summary: await insightSummary.summarize(userId, items) }
  } catch (err) {
    console.error('Insight summary failed:', err.message)
    return { enabled: true, summary: null }
  }
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

module.exports = { getSettings, publicConfig, setAiSummary, getSummary, getInsights, refreshAllUsersInsights }
