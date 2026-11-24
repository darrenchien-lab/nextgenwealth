'use strict'
const { AppError } = require('./utils')

// One place that talks to the AI model: a local Ollama server, so nothing the
// person types or owns leaves this machine. Returns the JSON the model wrote to
// fit `schema` (a standard JSON Schema). Used by AI entry, the insights summary
// and the help assistant.
// history: earlier turns as { role: 'user' | 'model', text }, oldest first.

const BASE_URL = () => (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '')
const MODEL = () => process.env.OLLAMA_MODEL || 'llama3.1:8b'
// A local model on an ordinary laptop can take a while, especially the first
// time it is loaded into memory.
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120000
// How long to wait to find out whether Ollama is there at all.
const CHECK_MS = Number(process.env.OLLAMA_CHECK_MS) || 3000
// The help guide alone is a few thousand tokens; Ollama's own default window can cut it off.
const CONTEXT_TOKENS = 8192
const UNAVAILABLE = "We couldn't do that right now. Please try again in a moment."
const NOT_REACHABLE = () => new AppError(503, 'AI_NOT_CONFIGURED', "AI isn't available right now.")

const fetchWithin = async (url, ms, options = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const callModel = async ({ system, text, schema, temperature = 0, history = [] }) => {
  // A quick look first, so a computer that is switched off fails in seconds
  // instead of leaving the person waiting for the full timeout.
  try {
    const alive = await fetchWithin(`${BASE_URL()}/api/version`, CHECK_MS)
    if (!alive.ok) throw new Error(`HTTP ${alive.status}`)
  } catch (err) {
    console.error('Ollama is not reachable:', err.name === 'AbortError' ? 'no answer' : (err.cause?.code || err.message))
    throw NOT_REACHABLE()
  }

  const messages = [
    { role: 'system', content: system },
    ...history.map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })),
    { role: 'user', content: text }
  ]

  let response
  try {
    response = await fetchWithin(`${BASE_URL()}/api/chat`, TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        messages,
        format: schema,
        stream: false,
        options: { temperature, num_ctx: CONTEXT_TOKENS }
      })
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new AppError(504, 'AI_TIMEOUT', 'That took too long. Please try again.')
    console.error('Ollama request failed:', err.cause?.code || err.message)
    throw NOT_REACHABLE()
  }

  if (!response.ok) {
    console.error('Ollama request failed with HTTP', response.status, response.status === 404 ? `(is the model "${MODEL()}" pulled?)` : '')
    throw new AppError(502, 'AI_UNAVAILABLE', UNAVAILABLE)
  }
  const data = await response.json().catch(() => null)
  const raw = data?.message?.content
  if (!raw) throw new AppError(502, 'AI_UNAVAILABLE', UNAVAILABLE)
  try {
    return JSON.parse(raw)
  } catch {
    throw new AppError(502, 'AI_UNAVAILABLE', UNAVAILABLE)
  }
}

module.exports = { callModel }
