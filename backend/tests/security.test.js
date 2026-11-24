'use strict'
process.env.NODE_ENV = 'test'
process.env.FRONTEND_URL = 'https://app.example.com'
process.env.CORS_ORIGINS = 'https://second.example.com/'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const request = require('supertest')
const { limits } = require('../shared/security')

// --- Browser access (CORS) and security headers ------------------------------
test('security: only the app\'s own websites are allowed to call the API from a browser', async () => {
  const app = require('../app')
  const ok = await request(app).get('/healthz').set('Origin', 'https://app.example.com')
  assert.equal(ok.headers['access-control-allow-origin'], 'https://app.example.com')
  const second = await request(app).get('/healthz').set('Origin', 'https://second.example.com')
  assert.equal(second.headers['access-control-allow-origin'], 'https://second.example.com')
  const evil = await request(app).get('/healthz').set('Origin', 'https://evil.example.net')
  assert.equal(evil.headers['access-control-allow-origin'], undefined)
  // A request with no Origin (curl, server to server) is still answered; private routes need a login anyway.
  assert.equal((await request(app).get('/healthz')).status, 200)
  assert.equal((await request(app).get('/accounts')).status, 401)
})

test('security: the server does not say it is Express', async () => {
  const res = await request(require('../app')).get('/healthz')
  assert.equal(res.headers['x-powered-by'], undefined)
})

test('security: a huge request body is refused', async () => {
  const res = await request(require('../app')).post('/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(200000) })
  assert.equal(res.status, 413)
})

// --- Request limits ----------------------------------------------------------
test('limits: the same address is stopped after too many attempts, with a plain message', async () => {
  const app = express()
  app.use(limits.auth({ limit: 3, force: true }))
  app.post('/try', (_req, res) => res.json({ ok: true }))
  for (let i = 0; i < 3; i++) assert.equal((await request(app).post('/try')).status, 200)
  const blocked = await request(app).post('/try')
  assert.equal(blocked.status, 429)
  assert.equal(blocked.body.code, 'TOO_MANY_REQUESTS')
  assert.match(blocked.body.message, /wait/i)
})
