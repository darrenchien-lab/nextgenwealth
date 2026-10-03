'use strict'
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { app, request, pool, cleanupTestUsers } = require('./helpers')

const TEST_EMAIL_PREFIX = 'autotest_'
const TEST_PASSWORD = 'TestPassword123'

after(async () => {
  await cleanupTestUsers()
})

// Inserted directly via SQL (email_verified_at left NULL) instead of going
// through POST /auth/register, so this test suite never triggers a real
// verification email over the network.
async function createUnverifiedUser() {
  const email = `${TEST_EMAIL_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4)
  const result = await pool.query(
    'INSERT INTO users (email, password_hash, email_verified_at) VALUES ($1, $2, NULL) RETURNING id, email',
    [email, passwordHash]
  )
  return result.rows[0]
}

async function issueVerificationToken(userId) {
  const rawToken = crypto.randomBytes(16).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  await pool.query(
    'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  )
  return rawToken
}

test('login: an unverified email is rejected with EMAIL_NOT_VERIFIED, not a generic 401', async () => {
  const user = await createUnverifiedUser()

  const res = await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })

  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED')
})

test('login: wrong password is rejected with a generic 401 (not EMAIL_NOT_VERIFIED, even for an unverified account)', async () => {
  const user = await createUnverifiedUser()

  const res = await request(app).post('/auth/login').send({ email: user.email, password: 'wrong-password' })

  assert.equal(res.status, 401)
})

test('verify-email: a valid token verifies the account, and login then succeeds', async () => {
  const user = await createUnverifiedUser()
  const rawToken = await issueVerificationToken(user.id)

  const verifyRes = await request(app).post('/auth/verify-email').send({ token: rawToken })
  assert.equal(verifyRes.status, 200)

  const loginRes = await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })
  assert.equal(loginRes.status, 200)
  assert.ok(loginRes.body.token)
})

test('verify-email: the same token cannot be used twice', async () => {
  const user = await createUnverifiedUser()
  const rawToken = await issueVerificationToken(user.id)

  const first = await request(app).post('/auth/verify-email').send({ token: rawToken })
  assert.equal(first.status, 200)

  const second = await request(app).post('/auth/verify-email').send({ token: rawToken })
  assert.equal(second.status, 400)
})

test('verify-email: a made-up token is rejected', async () => {
  const res = await request(app).post('/auth/verify-email').send({ token: 'not-a-real-token' })
  assert.equal(res.status, 400)
})
