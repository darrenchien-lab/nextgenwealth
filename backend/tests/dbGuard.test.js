'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { databaseProblem } = require('../db/dbGuard')

const env = (url, extra = {}) => ({ DATABASE_URL: url, ...extra })

test('db guard: everyday local development and the test database are fine', () => {
  assert.equal(databaseProblem(env('postgres://u:p@localhost:5432/financeflow')), null)
  assert.equal(databaseProblem(env('postgres://u:p@127.0.0.1:5432/financeflow_test', { NODE_ENV: 'test' })), null)
})

test('db guard: a laptop is stopped from reaching a live or remote database', () => {
  assert.match(databaseProblem(env('postgres://u:p@localhost:5432/financeflow_prod')), /looks like the production one/)
  assert.match(databaseProblem(env('postgres://u:p@db.example.com:5432/financeflow')), /another computer/)
  assert.equal(databaseProblem(env('postgres://u:p@db.example.com:5432/financeflow_staging', { ALLOW_REMOTE_DB: '1' })), null)
})

test('db guard: the live server is stopped from using a development database', () => {
  assert.match(databaseProblem(env('postgres://u:p@db.example.com/financeflow', { NODE_ENV: 'production' })), /does not look like the production one/)
  assert.match(databaseProblem(env('postgres://u:p@localhost/financeflow_test', { NODE_ENV: 'production' })), /does not look like the production one/)
  assert.equal(databaseProblem(env('postgres://u:p@db.example.com/financeflow_prod', { NODE_ENV: 'production' })), null)
  assert.equal(databaseProblem(env('postgres://u:p@db.example.com/financeflow', { NODE_ENV: 'production', ALLOW_ANY_DB_NAME: '1' })), null)
})

test('db guard: a missing or broken DATABASE_URL is reported plainly', () => {
  assert.match(databaseProblem({}), /not set/)
  assert.match(databaseProblem({ DATABASE_URL: 'not a url' }), /could not be read/)
})
