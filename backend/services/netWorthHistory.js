'use strict'
const { query } = require('../db/pool')
const { loadSql } = require('../db/loadSql')
const currencyService = require('./currency')

const SQL = {
  listSnapshotCurrenciesSince: loadSql('reports/listSnapshotCurrenciesSince'),
  shiftNetWorthSnapshots: loadSql('reports/shiftNetWorthSnapshots'),
  listPortfolioCurrenciesSince: loadSql('investments/listSnapshotCurrenciesSince'),
  shiftPortfolioSnapshots: loadSql('investments/shiftPortfolioSnapshots'),
  shiftHoldingSnapshots: loadSql('investments/shiftHoldingSnapshots')
}

// Local calendar date, matching how the daily snapshots are dated.
const localDateKey = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Net worth history is a series of daily snapshots that are never
// recomputed, so a balance change recorded with an earlier date (a late
// transaction, an edit, a deletion, a backdated transfer) would otherwise
// leave every day between then and now showing the old total. This shifts
// each saved snapshot from that date up to yesterday by the change,
// converted into the currency the snapshot was taken in. Today's snapshot
// is left alone — it is refreshed from live balances after every change.
//
// changes: [{ occurredAt, amount, currency }], amount signed as it moved the
// account balance. Best-effort: runs after the change has been saved, and a
// failure here is logged rather than undoing that change.
const shiftNetWorthHistory = async (userId, changes) => {
  try {
    for (const { occurredAt, amount, currency } of changes) {
      if (!amount) continue
      const fromDate = localDateKey(occurredAt)
      const snapshotCurrencies = await query(SQL.listSnapshotCurrenciesSince, [userId, fromDate])
      for (const { display_currency: snapshotCurrency } of snapshotCurrencies.rows) {
        const { amount: converted, available } = await currencyService.convertAmount(amount, currency, snapshotCurrency)
        if (!available) continue
        await query(SQL.shiftNetWorthSnapshots, [Math.round(converted * 100) / 100, userId, snapshotCurrency, fromDate])
      }
    }
  } catch (err) {
    console.error(`Failed to update net worth history for user ${userId}:`, err.message)
  }
}

// The portfolio charts (total and per holding) are daily snapshots too. A buy
// or sell recorded with an earlier date shifts every saved day from then to
// yesterday by the units' value and cost. Past daily prices aren't stored, so
// those days value the units at the trade's own price — close enough for a
// trend line, and exact again from today on. Best-effort, like the above.
const shiftInvestmentHistory = async (userId, { holdingId, assetName, occurredAt, valueDelta, costDelta, currency }) => {
  try {
    const fromDate = localDateKey(occurredAt)
    const snapshotCurrencies = await query(SQL.listPortfolioCurrenciesSince, [userId, fromDate])
    for (const { display_currency: snapshotCurrency } of snapshotCurrencies.rows) {
      const value = await currencyService.convertAmount(valueDelta, currency, snapshotCurrency)
      const cost = await currencyService.convertAmount(costDelta, currency, snapshotCurrency)
      if (!value.available || !cost.available) continue
      const v = Math.round(value.amount * 100) / 100
      const c = Math.round(cost.amount * 100) / 100
      await query(SQL.shiftPortfolioSnapshots, [v, c, userId, snapshotCurrency, fromDate])
      await query(SQL.shiftHoldingSnapshots, [userId, holdingId, assetName, v, c, snapshotCurrency, fromDate])
    }
  } catch (err) {
    console.error(`Failed to update investment history for user ${userId}:`, err.message)
  }
}

module.exports = { shiftNetWorthHistory, shiftInvestmentHistory }
