// 'id-ID' locale so grouping reads as period-for-thousands, comma-for-decimal
// (e.g. Rp432.411.131,87) — the convention the user reads amounts in
// throughout the app, regardless of which currency is being displayed.
export function formatCurrency(amount, currency = 'IDR') {
  if (amount === null || amount === undefined) return '-'
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

// Same grouping convention as formatCurrency, without a currency symbol —
// for chart axis ticks where a repeated currency symbol on every label
// would just be clutter.
export function formatNumber(amount) {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('id-ID').format(amount)
}

// Asset quantities are stored with 8 decimal places; trailing zeros are
// dropped (1200.00000000 → 1.200) but up to 8 digits are kept, so a small
// crypto amount like 0.00012345 BTC isn't rounded away.
export function formatQuantity(quantity) {
  if (quantity === null || quantity === undefined) return '-'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 8 }).format(Number(quantity))
}

export function formatPercent(value) {
  if (value === null || value === undefined) return '-'
  return `${value}%`
}
