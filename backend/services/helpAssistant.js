'use strict'
const { AppError, badRequest } = require('../shared/utils')
const gemini = require('../shared/gemini')
const { PAGES, GUIDE } = require('../shared/appGuide')

// The "Help" chat: answers questions about how to use the app, from the
// written guide only. It is sent the question and the last few turns of the
// chat and nothing from the person's money.

const MAX_QUESTION = 500
const MAX_HISTORY = 6
const MAX_HISTORY_TEXT = 1500
const PER_MINUTE = 8
const PER_DAY = 100
const usage = new Map()
// A chat should answer quickly, so the lighter model goes first.
const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest']

const checkRateLimit = (userId, now = Date.now()) => {
  const recent = (usage.get(userId) || []).filter((t) => now - t < 24 * 60 * 60 * 1000)
  if (recent.length === 0) usage.delete(userId)
  if (recent.length >= PER_DAY) throw new AppError(429, 'TOO_MANY_REQUESTS', "You've asked a lot of questions today. Please try again tomorrow.")
  if (recent.filter((t) => now - t < 60 * 1000).length >= PER_MINUTE) throw new AppError(429, 'TOO_MANY_REQUESTS', 'Please wait a moment, then ask again.')
  recent.push(now)
  usage.set(userId, recent)
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    links: { type: 'ARRAY', items: { type: 'STRING', enum: Object.keys(PAGES) } }
  },
  required: ['answer']
}

const SYSTEM = [
  'You are the built-in help assistant of the personal finance app NextGen Wealth. You help people learn how to use the app.',
  'Answer ONLY from the guide below. If the guide does not cover something, say you are not sure and point to the most relevant page; never invent buttons, menus or features.',
  "You explain how the app works. You do not give financial, investment, tax or legal advice, and you cannot see or change the person's data. For questions like \"should I buy this\", say that is their decision and offer to explain the app feature instead.",
  'Politely decline anything unrelated to using the app.',
  'LANGUAGE: reply in the same language as the person\'s latest message (Indonesian if they write Indonesian, otherwise English), in simple, friendly words, at most about 110 words. Keep exact menu and button names (such as "Add Holding") unchanged.',
  'FORMAT: for how-to questions give short numbered steps, each step on its own line (separate lines with a newline character), starting with a one-line intro. Plain text only: no markdown symbols, no asterisks.',
  'In "links", list up to 2 pages most useful for the answer (use none if no page fits).',
  '',
  'GUIDE:',
  GUIDE
].join('\n')

const cleanHistory = (history) => {
  if (!Array.isArray(history)) return []
  const turns = history
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim())
    .slice(-MAX_HISTORY)
    .map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', text: h.text.trim().slice(0, MAX_HISTORY_TEXT) }))
  // The conversation must open with the person, not the assistant.
  while (turns.length > 0 && turns[0].role !== 'user') turns.shift()
  return turns
}

const ask = async (userId, question, history, { callModel = gemini.callGemini } = {}) => {
  if (typeof question !== 'string' || question.trim() === '') throw badRequest('Type your question first.')
  if (question.length > MAX_QUESTION) throw badRequest(`Please keep your question under ${MAX_QUESTION} characters.`)

  checkRateLimit(userId)
  let result
  try {
    result = await callModel({ system: SYSTEM, text: question.trim(), schema: SCHEMA, temperature: 0.2, history: cleanHistory(history), models: FAST_MODELS })
  } catch (err) {
    // A call that failed on our side doesn't use up one of the person's tries.
    usage.set(userId, (usage.get(userId) || []).slice(0, -1))
    throw err
  }

  const answer = typeof result?.answer === 'string' ? result.answer.trim() : ''
  if (!answer) throw new AppError(502, 'AI_UNAVAILABLE', "We couldn't answer that right now. Please try again.")
  const links = [...new Set(Array.isArray(result.links) ? result.links : [])]
    .filter((path) => PAGES[path])
    .slice(0, 2)
    .map((path) => ({ href: path, label: PAGES[path] }))
  return { answer, links }
}

module.exports = { ask, checkRateLimit, cleanHistory, MAX_QUESTION }
