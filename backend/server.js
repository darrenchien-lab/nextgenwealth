'use strict'
const app = require('./app')
const { startScheduledJobs } = require('./jobs/scheduler')

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`NextGen Wealth API listening on port ${PORT}`)
  startScheduledJobs()
})
