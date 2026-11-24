'use strict'
const express = require('express')
const cors = require('cors')
require('dotenv').config()

const { errorHandler, notFoundHandler } = require('./middleware')
const reportsService = require('./services/reports')
const { corsOptions, limits, trustProxy } = require('./shared/security')

const app = express()

// Behind a proxy (set TRUST_PROXY=1) the real visitor's address is read from it,
// so the limits below count each person separately.
app.set('trust proxy', trustProxy())
app.disable('x-powered-by')
// Only the app's own website may call the API from a browser (see shared/security.js).
app.use(cors(corsOptions()))
// A small body is plenty for this app; a huge one is only ever an attack.
app.use(express.json({ limit: '100kb' }))

// Net worth can change from many places (a transaction, a transfer, an
// account balance adjustment, a bill payment, an investment edit — not just
// the investments routes) — trying to remember to call
// takeNetWorthSnapshot after each one individually is exactly how the
// investments-only version of this fix (still) missed transactions and
// account adjustments. Doing it once here, for every successful mutating
// request on behalf of a signed-in user, can't be forgotten by a future
// route the same way. Registered early so the 'finish' listener is in place
// no matter which router ends up handling the request; it fires after the
// response is already sent, so it never adds latency to the request itself.
app.use((req, res, next) => {
  res.on('finish', () => {
    if (req.method !== 'GET' && req.userId && res.statusCode < 400) {
      reportsService.takeNetWorthSnapshot(req.userId)
        .catch((err) => console.error(`Failed to refresh net worth snapshot for user ${req.userId}:`, err.message))
    }
  })
  next()
})

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }))

app.use('/auth/login', limits.auth())
app.use('/auth/forgot-password', limits.auth())
app.use('/auth/reset-password', limits.auth())
app.use('/auth/verify-email', limits.auth())
app.use('/auth/resend-verification', limits.auth())
app.use('/auth/register', limits.register())
app.use('/auth', require('./routes/auth'))
app.use('/accounts', require('./routes/accounts'))
app.use('/transfers', require('./routes/transfers'))
app.use('/categories', require('./routes/categories'))
app.use('/transactions', require('./routes/transactions'))
app.use('/budgets', require('./routes/budgets'))
app.use('/bills', require('./routes/bills'))
app.use('/goals', require('./routes/savingsGoals'))
app.use('/investments', require('./routes/investments'))
app.use('/reports', require('./routes/reports'))
app.use('/insights', require('./routes/insights'))
app.use('/smart-entry', require('./routes/smartEntry'))
app.use('/help', require('./routes/help'))

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
