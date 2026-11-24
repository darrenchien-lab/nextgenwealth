'use strict'
const { rateLimit } = require('express-rate-limit')

// Browser-side access rules and request limits for a public deployment.

// Which websites may call this API from a browser: FRONTEND_URL, plus any
// extra ones listed (comma separated) in CORS_ORIGINS. Requests that carry no
// Origin (curl, server to server) are not a browser's doing and pass; they still
// need a login for anything private.
const allowedOrigins = () => {
  const list = [process.env.FRONTEND_URL || 'http://localhost:3001', ...String(process.env.CORS_ORIGINS || '').split(',')]
  return new Set(list.map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean))
}

const corsOptions = () => {
  const allowed = allowedOrigins()
  return {
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600
  }
}

const tooMany = (message) => ({ success: false, code: 'TOO_MANY_REQUESTS', message })

// Builds the limiter for one group of routes. `limit` requests per `windowMs`
// for each IP address. Switched off in the test suite, which fires hundreds of
// requests from one address on purpose (the limiter itself is tested separately
// with force: true).
const limiter = ({ windowMs, limit, message, force = false }) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany(message),
  skip: () => process.env.NODE_ENV === 'test' && !force
})

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const limits = {
  // Signing in, resetting a password, asking for another email: slow enough that guessing is pointless.
  auth: (opts = {}) => limiter({ windowMs: 15 * MINUTE, limit: 30, message: 'Too many attempts. Please wait a few minutes and try again.', ...opts }),
  // New accounts per address.
  register: (opts = {}) => limiter({ windowMs: HOUR, limit: 10, message: 'Too many sign-ups from this connection. Please try again later.', ...opts })
}

// How many proxies sit in front of the app (0 when it is reached directly).
// Without this, every visitor behind a proxy looks like the same IP address.
const trustProxy = () => {
  const raw = process.env.TRUST_PROXY
  if (raw === undefined || raw === '') return false
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : false
}

module.exports = { corsOptions, allowedOrigins, limits, trustProxy }
