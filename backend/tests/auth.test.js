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

test('login: "keep me signed in" gives a long session, and repeated wrong passwords lock the email out for a while', async () => {
  const user = await createUnverifiedUser()
  await pool.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [user.id])

  const short = await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })
  const long = await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD, rememberMe: true })
  const hoursLeft = (res) => (new Date(res.body.expiresAt).getTime() - Date.now()) / 3600000
  assert.ok(hoursLeft(long) > 24 * 7, 'remembered session lasts weeks')
  assert.ok(hoursLeft(short) < hoursLeft(long))

  for (let i = 0; i < 5; i++) {
    assert.equal((await request(app).post('/auth/login').send({ email: user.email, password: 'wrong-password' })).status, 401)
  }
  // Locked now, even with the right password.
  const locked = await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })
  assert.equal(locked.status, 429)
  assert.equal(locked.body.code, 'TOO_MANY_ATTEMPTS')
})

async function signedInUser() {
  const user = await createUnverifiedUser()
  await pool.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [user.id])
  const res = await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })
  return { user, token: res.body.token }
}
const bearer = (token) => ({ Authorization: `Bearer ${token}` })

test('account: /auth/me returns the signed-in user', async () => {
  const { user, token } = await signedInUser()
  const res = await request(app).get('/auth/me').set(bearer(token))
  assert.equal(res.status, 200)
  assert.equal(res.body.user.email, user.email)
  assert.equal(res.body.user.emailVerified, true)
})

test('account: changing the password needs the current one, ends other sessions, and keeps this device signed in', async () => {
  const { user, token } = await signedInUser()
  const other = (await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })).body.token

  // A wrong current password is a 400, never a 401 (which the app reads as an ended session).
  const wrong = await request(app).post('/auth/change-password').set(bearer(token)).send({ currentPassword: 'nope-nope', newPassword: 'BrandNewPass456' })
  assert.equal(wrong.status, 400)
  assert.equal(wrong.body.code, 'WRONG_PASSWORD')
  assert.equal((await request(app).post('/auth/change-password').set(bearer(token)).send({ currentPassword: TEST_PASSWORD, newPassword: 'short' })).status, 400)

  await new Promise((resolve) => setTimeout(resolve, 1100)) // tokens are stamped in whole seconds
  const changed = await request(app).post('/auth/change-password').set(bearer(token)).send({ currentPassword: TEST_PASSWORD, newPassword: 'BrandNewPass456' })
  assert.equal(changed.status, 200)
  assert.ok(changed.body.token)

  assert.equal((await request(app).get('/auth/me').set(bearer(token))).status, 401, 'the old token stops working')
  assert.equal((await request(app).get('/auth/me').set(bearer(other))).status, 401, 'so does another device')
  assert.equal((await request(app).get('/auth/me').set(bearer(changed.body.token))).status, 200, 'the replacement works')
  assert.equal((await request(app).post('/auth/login').send({ email: user.email, password: 'BrandNewPass456' })).status, 200)
  assert.equal((await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status, 401)
})

test('account: signing out everywhere ends every session', async () => {
  const { user, token } = await signedInUser()
  const other = (await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })).body.token
  assert.equal((await request(app).post('/auth/logout-all').set(bearer(token))).status, 200)
  assert.equal((await request(app).get('/auth/me').set(bearer(token))).status, 401)
  assert.equal((await request(app).get('/auth/me').set(bearer(other))).status, 401)
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const again = await request(app).post('/auth/login').send({ email: user.email, password: TEST_PASSWORD })
  assert.equal((await request(app).get('/auth/me').set(bearer(again.body.token))).status, 200, 'a new login works')
})

test('account: deleting the account needs the password and removes the user and their data', async () => {
  const { user, token } = await signedInUser()
  await request(app).post('/accounts').set(bearer(token)).send({ name: 'Doomed', type: 'cash', currency: 'IDR', balance: 100 })

  const wrong = await request(app).delete('/auth/account').set(bearer(token)).send({ password: 'not-the-password' })
  assert.equal(wrong.status, 400)
  assert.equal((await pool.query('SELECT 1 FROM users WHERE id = $1', [user.id])).rowCount, 1, 'still there after a wrong password')

  assert.equal((await request(app).delete('/auth/account').set(bearer(token)).send({ password: TEST_PASSWORD })).status, 200)
  assert.equal((await pool.query('SELECT 1 FROM users WHERE id = $1', [user.id])).rowCount, 0)
  assert.equal((await pool.query('SELECT 1 FROM accounts WHERE user_id = $1', [user.id])).rowCount, 0, 'their accounts went with them')
  assert.equal((await request(app).get('/auth/me').set(bearer(token))).status, 401, 'the old token no longer works')
})
