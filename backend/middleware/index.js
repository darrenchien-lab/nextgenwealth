'use strict'
const jwt = require('jsonwebtoken')
require('dotenv').config()
const { query } = require('../db/pool')
const { AppError, unauthorized } = require('../shared/utils')

const JWT_SECRET = process.env.JWT_SECRET

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

    const revoked = await query('SELECT 1 FROM revoked_tokens WHERE token_id = $1', [payload.jti])
    if (revoked.rowCount > 0) {
      throw unauthorized('Token has been revoked')
    }

    req.userId = payload.sub
    req.tokenId = payload.jti
    req.tokenExpiresAt = new Date(payload.exp * 1000)
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
