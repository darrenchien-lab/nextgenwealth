'use strict'
const cron = require('node-cron')
const currencyService = require('../services/currency')
const authService = require('../services/auth')
const transactionsService = require('../services/transactions')
const billsService = require('../services/bills')
const insightsService = require('../services/insights')
const accountsService = require('../services/accounts')
const reportsService = require('../services/reports')
const investmentsService = require('../services/investments')
const { pool } = require('../db/pool')

require('dotenv').config()
const STALENESS_ALERT_DAYS = Number(process.env.EXCHANGE_RATE_STALENESS_ALERT_DAYS || 3)

const checkExchangeRateStaleness = async () => {
  const { lastFetchedAt, daysSinceLastFetch } = await currencyService.getCacheStaleness()
  if (lastFetchedAt === null || daysSinceLastFetch > STALENESS_ALERT_DAYS) {
    console.warn(
      `[alert] Exchange rate cache is stale: last successful fetch was ${
        lastFetchedAt ? `${daysSinceLastFetch.toFixed(1)} days ago` : 'never'
      }.`
    )
  }
}

// Registers all recurring background work. Runs once daily at 01:00 server
// time — currency conversion in this app only needs day-level freshness, and
// running once keeps Frankfurter.app calls and DB writes minimal.
const startScheduledJobs = () => {
  cron.schedule('0 1 * * *', async () => {
    await currencyService.fetchAndCacheDailyRates()
    await checkExchangeRateStaleness()
  })

  // Net worth + investment snapshots for history charting — run after the
  // rate fetch above so the day's snapshot uses fresh rates.
  cron.schedule('15 1 * * *', async () => {
    await reportsService.takeAllUsersNetWorthSnapshots()
    await investmentsService.takeAllUsersSnapshots()
  })

  // Catches up today's snapshot immediately on startup for any user who
  // doesn't already have one — the 01:15 cron above only fires if the
  // server happens to be running at that exact time, which rarely holds for
  // a server only started during active use rather than left running
  // overnight. Fire-and-forget: startScheduledJobs() itself isn't async.
  reportsService.catchUpAllUsersNetWorthSnapshots()
    .catch((err) => console.error('Startup net worth snapshot catch-up failed:', err.message))
  investmentsService.catchUpAllUsersSnapshots()
    .catch((err) => console.error('Startup investment snapshot catch-up failed:', err.message))
  // Same reasoning as the two snapshot catch-ups above, but for exchange
  // rates — otherwise a server that isn't left running at 01:00 can go
  // stale for as long as it stays off.
  currencyService.catchUpIfStale()
    .catch((err) => console.error('Startup exchange rate catch-up failed:', err.message))

  // Revoked JWTs only need to be kept around until they would have expired
  // anyway, so the prune job runs more often to keep the table small.
  cron.schedule('0 * * * *', async () => {
    await authService.pruneExpiredRevokedTokens()
    await authService.pruneExpiredPasswordResetTokens()
    await authService.pruneExpiredEmailVerificationTokens()
  })

  // Materializes due recurring transactions once a day.
  cron.schedule('30 0 * * *', async () => {
    await transactionsService.materializeDueRecurringTransactions()
  })

  // Shares the same daily cadence to keep bill due-date status fresh
  // (design.md Decision 4 — one scheduler for both recurrence features).
  cron.schedule('45 0 * * *', async () => {
    await billsService.flagOverdueBills()
  })

  // Periodic insight refresh, independent of any single dashboard load
  // (spec: Insight Refresh) — keeps external-AI latency off the request path.
  cron.schedule('0 6 * * *', async () => {
    await insightsService.refreshAllUsersInsights()
  })

  // Balance reconciliation sweep (design.md Risks/Trade-offs) — alerts (via
  // console.warn, per reconcileBalances) rather than auto-correcting drift.
  cron.schedule('0 2 * * *', async () => {
    const users = await pool.query('SELECT id FROM users')
    for (const user of users.rows) {
      await accountsService.reconcileBalances(user.id)
    }
  })
}

module.exports = { startScheduledJobs, checkExchangeRateStaleness }
