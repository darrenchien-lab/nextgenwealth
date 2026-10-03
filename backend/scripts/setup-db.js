'use strict'
const fs = require('fs')
const path = require('path')
const { pool } = require('../db/pool')

const SCHEMA_DIR = path.resolve(__dirname, '../schema')

async function run() {
  const files = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = fs.readFileSync(path.join(SCHEMA_DIR, file)).toString()
    console.log(`Running ${file}...`)
    await pool.query(sql)
  }
  console.log('Database schema is up to date.')
  await pool.end()
}

run().catch((err) => {
  console.error('Failed to set up database schema:', err)
  process.exit(1)
})
