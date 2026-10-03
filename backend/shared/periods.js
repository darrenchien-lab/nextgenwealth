'use strict'

// Pure date-math for a user-configurable "budget cycle" — a recurring
// period that starts on a chosen day of the month (e.g. payday) instead of
// always the 1st, so "this month" in reports matches how a user actually
// budgets rather than the calendar. No DB access here; callers fetch a
// user's cycleStartDay (accountsService.getCycleStartDay) and pass it in.

// The cycle containing `referenceDate`, as [start, end] Date objects (end is
// 23:59:59 the day before the next cycle starts).
const getCurrentPeriodBounds = (cycleStartDay, referenceDate = new Date()) => {
  let year = referenceDate.getFullYear()
  let month = referenceDate.getMonth()
  if (referenceDate.getDate() < cycleStartDay) {
    month -= 1
    if (month < 0) {
      month = 11
      year -= 1
    }
  }
  const start = new Date(year, month, cycleStartDay)
  const end = new Date(year, month + 1, cycleStartDay - 1, 23, 59, 59)
  return { start, end }
}

// The cycle `monthsBack` full cycles before the one containing referenceDate.
const getPeriodBoundsForOffset = (cycleStartDay, monthsBack, referenceDate = new Date()) => {
  const { start } = getCurrentPeriodBounds(cycleStartDay, referenceDate)
  const shifted = new Date(start.getFullYear(), start.getMonth() - monthsBack, cycleStartDay)
  return getCurrentPeriodBounds(cycleStartDay, shifted)
}

// 'YYYY-MM' label for the cycle a date falls into — the label is the
// year/month the cycle STARTS in, not necessarily the calendar month the
// date itself falls in (e.g. cutoff day 10: Sep 5 belongs to the cycle
// that started Aug 10, so its period key is '2026-08').
const periodKeyForDate = (cycleStartDay, date = new Date()) => {
  const { start } = getCurrentPeriodBounds(cycleStartDay, date)
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
}

// Bounds for an explicit 'YYYY-MM' period label (the label names the month
// the cycle starts in).
const periodKeyToBounds = (cycleStartDay, periodKey) => {
  const [year, month] = periodKey.split('-').map(Number)
  const start = new Date(year, month - 1, cycleStartDay)
  const end = new Date(year, month, cycleStartDay - 1, 23, 59, 59)
  return { start, end }
}

// A calendar-month cycle (the default) reads as "September 2026"; a
// custom cutoff reads as a date range, since it spans two calendar months.
const formatPeriodLabel = (start, end, cycleStartDay) => {
  if (cycleStartDay === 1) {
    return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

module.exports = {
  getCurrentPeriodBounds,
  getPeriodBoundsForOffset,
  periodKeyForDate,
  periodKeyToBounds,
  formatPeriodLabel
}
