'use strict'
const jwt = require('jsonwebtoken')
require('dotenv').config()
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { AppError, unauthorized } = require('../shared/utils')

const JWT_SECRET = process.env.JWT_SECRET
const SESSION_STATE_SQL = loadSql('auth/getSessionState')

// Every protected route runs this first: verify the JWT signature/expiry,
// then check the revocation list so a logged-out token stops working
// immediately instead of staying valid until it naturally expires.
const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) {
      throw unauthorized('Missing or invalid Authorization header')
    }

    let payload
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      throw unauthorized('Invalid or expired token')
    }

    const session = (await query(SESSION_STATE_SQL, [payload.sub, payload.jti])).rows[0]
    if (!session) throw unauthorized('This account no longer exists')
    if (session.revoked) throw unauthorized('Token has been revoked')
    // Signing out of every device (or changing the password) ends all
    // sessions issued before that moment.
    if (session.tokens_valid_after && payload.iat < Math.floor(new Date(session.tokens_valid_after).getTime() / 1000)) {
      throw unauthorized('This session has ended. Please log in again')
    }

    req.userId = payload.sub
    req.tokenId = payload.jti
    req.tokenExpiresAt = new Date(payload.exp * 1000)
    req.tokenLifetimeSeconds = payload.exp - payload.iat
    next()
  } catch (err) {
    next(err)
  }
}

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message })
  }
  console.error(err)
  res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Internal server error' })
}

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Route not found' })
}

module.exports = { requireAuth, JWT_SECRET, errorHandler, notFoundHandler }
