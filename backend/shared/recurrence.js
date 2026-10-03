'use strict'
const { badRequest } = require('./utils')

const FREQUENCIES = ['daily', 'weekly', 'monthly']

const validateFrequency = (frequency) => {
  if (!FREQUENCIES.includes(frequency)) {
    throw badRequest(`Frequency must be one of: ${FREQUENCIES.join(', ')}`)
  }
}

// Shared by transactions and bills (design.md Decision 4) so both recurrence
// features advance dates the same way.
const computeNextDueDate = (fromDate, frequency, interval = 1) => {
  const date = new Date(fromDate)
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + interval)
      break
    case 'weekly':
      date.setDate(date.getDate() + interval * 7)
      break
    case 'monthly':
      date.setMonth(date.getMonth() + interval)
      break
    default:
      throw badRequest(`Frequency must be one of: ${FREQUENCIES.join(', ')}`)
  }
  return date
}

module.exports = { FREQUENCIES, validateFrequency, computeNextDueDate }
