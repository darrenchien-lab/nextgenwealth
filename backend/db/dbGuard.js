'use strict'

// Stops the app from being pointed at the wrong database by mistake, e.g. a
// laptop running against the live database, or the live server running against
// a development one. It looks at NODE_ENV and at the database in DATABASE_URL.
//
//   NODE_ENV=production  -> the database name must contain "prod"
//   anything else        -> the database must be on this computer and its name
//                           must not contain "prod"
//
// Escape hatches, for the rare case that really is intended:
//   ALLOW_REMOTE_DB=1     a non-production run that talks to a database elsewhere (e.g. staging)
//   ALLOW_ANY_DB_NAME=1   a production run whose database name doesn't contain "prod"

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', ''])

const parseTarget = (url) => {
  try {
    const u = new URL(url)
    return { host: u.hostname.toLowerCase(), name: decodeURIComponent(u.pathname.replace(/^\//, '')).toLowerCase() }
  } catch {
    return null
  }
}

// Returns a problem description, or null when the setup looks right.
const databaseProblem = (env = process.env) => {
  if (!env.DATABASE_URL) return 'DATABASE_URL is not set.'
  const target = parseTarget(env.DATABASE_URL)
  if (!target) return 'DATABASE_URL could not be read.'
  const production = env.NODE_ENV === 'production'

  if (production) {
    if (env.ALLOW_ANY_DB_NAME !== '1' && !target.name.includes('prod')) {
      return `This is a production run, but the database "${target.name}" does not look like the production one (its name should contain "prod"). Refusing to start.`
    }
    return null
  }

  if (target.name.includes('prod')) {
    return `This is not a production run, but the database "${target.name}" looks like the production one. Refusing to start.`
  }
  if (!LOCAL_HOSTS.has(target.host) && env.ALLOW_REMOTE_DB !== '1') {
    return `This is not a production run, but the database is on another computer (${target.host}). Refusing to start. Set ALLOW_REMOTE_DB=1 if that is really intended.`
  }
  return null
}

const assertDatabaseTarget = (env = process.env) => {
  const problem = databaseProblem(env)
  if (problem) throw new Error(`Database safety check failed: ${problem}`)
}

module.exports = { databaseProblem, assertDatabaseTarget }
