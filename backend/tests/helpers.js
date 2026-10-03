'use strict'
process.env.NODE_ENV = 'test'

// Loaded here, before anything else requires ../app or ../db/pool, so
// DATABASE_URL (and any other test-only override) is locked in from
// .env.test before those modules' own `require('dotenv').config()` calls
// run — dotenv never overwrites a variable that's already set, so whichever
// file sets it FIRST wins. This must not depend on CLI flag ordering
// (an earlier `-r dotenv/config ... --test ...` combination silently lost
// this override and pointed tests at the real dev database instead).
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.test') })

// Hard stop, not just a warning: this suite deletes rows by pattern-matching
// on email, and the app holds real money data. If DATABASE_URL doesn't
// obviously point at a test database, refuse to run at all rather than risk
// repeating the earlier incident where a broken CLI flag combination let
// tests reach the real database.
if (!/test/i.test(process.env.DATABASE_URL || '')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not look like a test database (${process.env.DATABASE_URL}). ` +
    'Check backend/.env.test.'
  )
}

const request = require('supertest')
const bcrypt = require('bcryptjs')
const app = require('../app')
const { pool } = require('../db/pool')
const { issueTokenForUser } = require('../services/auth')

const TEST_EMAIL_PREFIX = 'autotest_'

// Inserts a fully verified user directly via SQL and mints a JWT for it,
// bypassing register()/login() entirely — tests must never depend on
// actually sending a verification email over the network.
const createTestUser = async () => {
  const email = `${TEST_EMAIL_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`
  const passwordHash = await bcrypt.hash('TestPassword123', 4)
  const result = await pool.query(
    'INSERT INTO users (email, password_hash, email_verified_at) VALUES ($1, $2, NOW()) RETURNING id, email',
    [email, passwordHash]
  )
  const user = result.rows[0]
  const { token } = issueTokenForUser(user.id)

  const authed = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${token}`)
  const as = {
    get: (path) => authed('get', path),
    post: (path) => authed('post', path),
    patch: (path) => authed('patch', path),
    put: (path) => authed('put', path),
    delete: (path) => authed('delete', path)
  }

  return { user, token, as }
}

// Every table with a user_id column has ON DELETE CASCADE back to users, so
// deleting the user row cleans up everything it created (accounts,
// transactions, holdings, etc.) in one go — matched by the fixed email
// prefix, same pattern as katalog-backend's TEST_PREFIX cleanup.
const cleanupTestUsers = async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${TEST_EMAIL_PREFIX}%`])
}

module.exports = { app, request, createTestUser, cleanupTestUsers, pool }
