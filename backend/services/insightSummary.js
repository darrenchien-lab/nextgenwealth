'use strict'
const crypto = require('crypto')
const gemini = require('../shared/gemini')

// A short, friendly paragraph over the findings the built-in engine already
// worked out. The model only rephrases those findings (it is told not to add
// numbers), and it is only asked when the person has turned this on, since the
// findings contain their amounts. Results are kept for a few hours so opening
// the page again doesn't ask again.

const CACHE_MS = 6 * 60 * 60 * 1000
const DAILY_LIMIT = 10
const cache = new Map() // userId -> { key, summary, at }
const asked = new Map() // userId -> timestamps of recent model calls

const SCHEMA = { type: 'OBJECT', properties: { summary: { type: 'STRING' } }, required: ['summary'] }

const SYSTEM = [
  'You are a warm, plain-spoken money coach inside a personal finance app.',
  'Write a summary of 2 or 3 short sentences (at most 60 words) of how this person\'s budget cycle is going, based ONLY on the findings below.',
  'Use only numbers and names that appear in the findings; never add or calculate new ones. No greeting, no sign-off, no emojis, no bullet points.',
  'If something needs attention, say what to look at first. Be encouraging about good news. Speak to the person as "you".'
].join(' ')

const summarize = async (userId, items, { callModel = gemini.callGemini, now = Date.now() } = {}) => {
  const findings = items.filter((i) => i.title)
  if (findings.length === 0) return null

  const text = findings.map((i) => `- [${i.tone}] ${i.title}: ${i.text}`).join('\n')
  const key = crypto.createHash('sha256').update(text).digest('hex')
  const hit = cache.get(userId)
  if (hit && hit.key === key && now - hit.at < CACHE_MS) return hit.summary

  const recent = (asked.get(userId) || []).filter((t) => now - t < 24 * 60 * 60 * 1000)
  // At the daily limit, nothing new is asked, and an older summary of different findings is not shown.
  if (recent.length >= DAILY_LIMIT) return null
  recent.push(now)
  asked.set(userId, recent)

  let result
  try {
    result = await callModel({ system: SYSTEM, text, schema: SCHEMA, temperature: 0.4 })
  } catch (err) {
    // A failed call doesn't use up one of the day's tries.
    asked.set(userId, recent.slice(0, -1))
    throw err
  }
  const summary = typeof result?.summary === 'string' ? result.summary.trim() : ''
  if (!summary || summary.length > 600) return null
  cache.set(userId, { key, summary, at: now })
  return summary
}

module.exports = { summarize }
