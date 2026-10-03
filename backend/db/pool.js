'use strict'
const { Pool, types } = require('pg')
require('dotenv').config()

// pg's default DATE parser builds a JS Date at local midnight, then
// JSON.stringify calls toISOString() which renders it in UTC — on a server
// whose timezone isn't UTC (this one runs in Asia/Taipei, UTC+8) that shifts
// every DATE column back onto the previous calendar day once it reaches the
// frontend (bill due dates, goal target dates, purchased_at, snapshot
// dates). Returning the raw 'YYYY-MM-DD' string instead of a Date object
// sidesteps the conversion entirely. OID 1082 = date.
types.setTypeParser(1082, (value) => value)

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const query = (sql, params) => pool.query(sql, params)

// Groups of writes that must succeed or fail together (e.g. recording a
// transaction and updating its account's cached balance in one go).
const withTransaction = async (work) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

module.exports = { pool, query, withTransaction }
