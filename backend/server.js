'use strict'
// On the live server a short secret would make login tokens easy to forge, so don't start with one.
if (process.env.NODE_ENV === 'production' && String(process.env.JWT_SECRET || '').length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long in production. Refusing to start.')
  process.exit(1)
}

const app = require('./app')
const { startScheduledJobs } = require('./jobs/scheduler')

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`NextGen Wealth API listening on port ${PORT}`)
  startScheduledJobs()
})
