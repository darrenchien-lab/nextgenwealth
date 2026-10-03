'use strict'
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const { AppError, badRequest, unauthorized, conflict } = require('../shared/utils')
const mailer = require('./mailer')

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'
const SALT_ROUNDS = 10

const SQL = {
  insertVerificationToken: loadSql('auth/insertVerificationToken'),
  getUserIdByEmail: loadSql('auth/getUserIdByEmail'),
  createUser: loadSql('auth/createUser'),
  getLoginByEmail: loadSql('auth/getLoginByEmail'),
  insertRevokedToken: loadSql('auth/insertRevokedToken'),
  pruneExpiredRevokedTokens: loadSql('auth/pruneExpiredRevokedTokens'),
  getUserByEmailForReset: loadSql('auth/getUserByEmailForReset'),
  insertPasswordResetToken: loadSql('auth/insertPasswordResetToken'),
  getPasswordResetTokenByHash: loadSql('auth/getPasswordResetTokenByHash'),
  updatePasswordHash: loadSql('auth/updatePasswordHash'),
  markPasswordResetTokenUsed: loadSql('auth/markPasswordResetTokenUsed'),
  pruneExpiredPasswordResetTokens: loadSql('auth/pruneExpiredPasswordResetTokens'),
  getVerificationTokenByHash: loadSql('auth/getVerificationTokenByHash'),
  markEmailVerified: loadSql('auth/markEmailVerified'),
  markVerificationTokenUsed: loadSql('auth/markVerificationTokenUsed'),
  getUserByEmailForResend: loadSql('auth/getUserByEmailForResend'),
  pruneExpiredEmailVerificationTokens: loadSql('auth/pruneExpiredEmailVerificationTokens')
}

const isValidEmail = (email) => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const createAndSendVerificationToken = async (user) => {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS)
  await query(SQL.insertVerificationToken, [user.id, tokenHash, expiresAt])
  await mailer.sendVerificationEmail(user.email, rawToken)
}

const register = async ({ email, password }) => {
  if (!isValidEmail(email)) throw badRequest('A valid email is required')
  if (typeof password !== 'string' || password.length < 8) {
    throw badRequest('Password must be at least 8 characters')
  }

  const existing = await query(SQL.getUserIdByEmail, [email])
  if (existing.rowCount > 0) {
    throw conflict('An account with this email already exists')
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const result = await query(SQL.createUser, [email, passwordHash])
  const user = result.rows[0]
  await createAndSendVerificationToken(user)
  return user
}

const issueTokenForUser = (userId) => {
  const jti = crypto.randomUUID()
  const token = jwt.sign({ sub: userId, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  const decoded = jwt.decode(token)
  return { token, jti, expiresAt: new Date(decoded.exp * 1000) }
}

const login = async ({ email, password }) => {
  if (!isValidEmail(email) || typeof password !== 'string') {
    throw unauthorized('Invalid email or password')
  }

  const result = await query(SQL.getLoginByEmail, [email])
  const user = result.rows[0]
  if (!user) throw unauthorized('Invalid email or password')

  const passwordMatches = await bcrypt.compare(password, user.password_hash)
  if (!passwordMatches) throw unauthorized('Invalid email or password')

  if (!user.email_verified_at) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email before logging in. Check your inbox for the verification link.')
  }

  const { token, expiresAt } = issueTokenForUser(user.id)
  return { token, expiresAt }
}

const logout = async (tokenId, expiresAt) => {
  await query(SQL.insertRevokedToken, [tokenId, expiresAt])
}

const pruneExpiredRevokedTokens = async () => {
  const result = await query(SQL.pruneExpiredRevokedTokens)
  return result.rowCount
}

// Always responds the same way whether or not the email is registered, so
// this endpoint can't be used to discover which emails have accounts.
const requestPasswordReset = async (email) => {
  if (!isValidEmail(email)) throw badRequest('A valid email is required')

  const result = await query(SQL.getUserByEmailForReset, [email])
  const user = result.rows[0]
  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)
    await query(SQL.insertPasswordResetToken, [user.id, tokenHash, expiresAt])
    await mailer.sendPasswordResetEmail(user.email, rawToken)
  }
  return { message: 'If that email is registered, a password reset link has been sent.' }
}

const resetPassword = async ({ token, newPassword }) => {
  if (typeof token !== 'string' || token.trim() === '') throw badRequest('A reset token is required')
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw badRequest('Password must be at least 8 characters')
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const result = await query(SQL.getPasswordResetTokenByHash, [tokenHash])
  const record = result.rows[0]
  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    throw badRequest('This reset link is invalid or has expired')
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  await query(SQL.updatePasswordHash, [passwordHash, record.user_id])
  await query(SQL.markPasswordResetTokenUsed, [record.id])
}

const pruneExpiredPasswordResetTokens = async () => {
  const result = await query(SQL.pruneExpiredPasswordResetTokens)
  return result.rowCount
}

const verifyEmail = async (token) => {
  if (typeof token !== 'string' || token.trim() === '') throw badRequest('A verification token is required')

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const result = await query(SQL.getVerificationTokenByHash, [tokenHash])
  const record = result.rows[0]
  if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
    throw badRequest('This verification link is invalid or has expired')
  }

  await query(SQL.markEmailVerified, [record.user_id])
  await query(SQL.markVerificationTokenUsed, [record.id])
}

// Same "respond identically either way" shape as requestPasswordReset, so
// this can't be used to discover which emails have accounts.
const resendVerificationEmail = async (email) => {
  if (!isValidEmail(email)) throw badRequest('A valid email is required')

  const result = await query(SQL.getUserByEmailForResend, [email])
  const user = result.rows[0]
  if (user && !user.email_verified_at) {
    await createAndSendVerificationToken(user)
  }
  return { message: 'If that email is registered and not yet verified, a verification link has been sent.' }
}

const pruneExpiredEmailVerificationTokens = async () => {
  const result = await query(SQL.pruneExpiredEmailVerificationTokens)
  return result.rowCount
}

module.exports = {
  register,
  login,
  logout,
  pruneExpiredRevokedTokens,
  issueTokenForUser,
  requestPasswordReset,
  resetPassword,
  pruneExpiredPasswordResetTokens,
  verifyEmail,
  resendVerificationEmail,
  pruneExpiredEmailVerificationTokens
}
