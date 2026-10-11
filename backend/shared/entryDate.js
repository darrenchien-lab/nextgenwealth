'use strict'
const { badRequest } = require('./utils')

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Anything that can be recorded late — a transfer, a bill payment, a balance
// correction, a goal contribution, an investment buy/sell — takes an optional
// date for when it actually happened. Returns the timestamp to store, or null
// for "now": no date, or today's date, keeps the current time so entries made
// today stay in the order they were entered; an earlier date ('YYYY-MM-DD')
// is stored at midday, and a full local date-time is kept as given. Dates
// after today are rejected.
const resolveEntryTime = (date, fieldName = 'date') => {
  if (date === undefined || date === null || date === '') return null
  if (typeof date !== 'string' || !(DATE_ONLY.test(date) || DATE_TIME.test(date))) {
    throw badRequest(`${fieldName} must be in YYYY-MM-DD format`)
  }
  const today = todayKey()
  const day = date.slice(0, 10)
  if (day > today) throw badRequest(`${fieldName} cannot be in the future`)
  if (DATE_TIME.test(date)) return date
  return day === today ? null : `${date}T12:00:00`
}

module.exports = { resolveEntryTime }
