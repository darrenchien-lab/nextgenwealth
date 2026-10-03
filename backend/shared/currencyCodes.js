'use strict'

// Common ISO 4217 currency codes. Not exhaustive of every code ISO defines,
// but covers the currencies users of this app are realistically expected to
// hold accounts in (including everything Frankfurter.app quotes rates for).
const ISO_4217_CODES = new Set([
  'IDR', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'MYR', 'THB', 'PHP', 'VND',
  'KRW', 'TWD', 'HKD', 'AUD', 'NZD', 'CAD', 'CHF', 'INR', 'AED', 'SAR', 'QAR',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'ZAR', 'BRL',
  'MXN', 'ILS', 'ISK'
])

const isValidCurrencyCode = (code) =>
  typeof code === 'string' && ISO_4217_CODES.has(code.toUpperCase())

module.exports = { ISO_4217_CODES, isValidCurrencyCode }
