'use strict'
const { AppError } = require('./utils')

const DEFAULT_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest']
const ATTEMPT_MS = 15000
const UNAVAILABLE = "We couldn't do that right now. Please try again in a moment."

// One place that talks to the Gemini API: returns the JSON the model wrote to
// fit `schema`. Used by AI entry, the insights summary and the help assistant.
// history: earlier turns as { role: 'user' | 'model', text }, oldest first.
// models: which models to try, in order (free-tier models get retired or
// overloaded now and then, so the next is tried when one is missing, busy or slow).
const callGemini = async ({ system, text, schema, temperature = 0, history = [], models = DEFAULT_MODELS }) => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AppError(503, 'AI_NOT_CONFIGURED', "AI isn't available right now.")
  const order = [process.env.GEMINI_MODEL, ...models].filter(Boolean)

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })), { role: 'user', parts: [{ text }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature }
  })

  let response = null
  let timedOut = false
  for (const model of order) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ATTEMPT_MS)
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
        signal: controller.signal
      })
      timedOut = false
      if (![404, 429, 503].includes(response.status)) break
    } catch (err) {
      response = null
      if (err.name === 'AbortError') timedOut = true
      else console.error('Gemini call failed:', err.message)
    } finally {
      clearTimeout(timer)
    }
  }

  if (!response) throw new AppError(timedOut ? 504 : 502, timedOut ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE', timedOut ? 'That took too long. Please try again.' : UNAVAILABLE)
  if (!response.ok) {
    console.error('Gemini request failed with HTTP', response.status)
    throw new AppError(502, 'AI_UNAVAILABLE', response.status === 429 ? "We're a bit busy right now. Please try again in a minute." : UNAVAILABLE)
  }
  const data = await response.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) throw new AppError(502, 'AI_UNAVAILABLE', UNAVAILABLE)
  try {
    return JSON.parse(raw)
  } catch {
    throw new AppError(502, 'AI_UNAVAILABLE', UNAVAILABLE)
  }
}

module.exports = { callGemini }
