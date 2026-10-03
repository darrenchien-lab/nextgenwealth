'use strict'
const fs = require('fs')
const path = require('path')

// Reads a raw .sql file from backend/sql/<name>.sql and caches its text so
// each query is only read from disk once (services call this at module load
// time, not per-request).
const cache = new Map()

const loadSql = (relativePath) => {
  if (cache.has(relativePath)) return cache.get(relativePath)
  const fullPath = path.join(__dirname, '..', 'sql', `${relativePath}.sql`)
  const text = fs.readFileSync(fullPath, 'utf8').trim()
  cache.set(relativePath, text)
  return text
}

module.exports = { loadSql }
