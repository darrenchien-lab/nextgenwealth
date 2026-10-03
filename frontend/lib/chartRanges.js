// Shared by the Reports "Net Worth History" chart and the Investments
// "Portfolio Value Over Time" chart — both plot a daily snapshot series with
// 'YYYY-MM-DD' string dates and need the same range-picker behavior.

// Each range is a date-window filter — "1M" means "only the last 30 calendar
// days" — the same way every stock/banking chart's range picker works.
// Ranges long enough that daily points would be unreadable and would paper
// over gaps between snapshots with misleading straight-line interpolation
// (1Y/5Y/All) are auto-aggregated to one point per calendar month instead;
// short ranges stay daily since that's few enough points to read cleanly.
// The user never picks granularity directly — it follows the range, same as
// Google Finance/Mint-style charts.
export const CHART_RANGES = [
  { label: '7D', days: 7, aggregate: 'day' },
  { label: '14D', days: 14, aggregate: 'day' },
  { label: '1M', days: 30, aggregate: 'day' },
  { label: '3M', days: 90, aggregate: 'day' },
  { label: '6M', days: 180, aggregate: 'day' },
  { label: '1Y', days: 365, aggregate: 'month' },
  { label: '5Y', days: 365 * 5, aggregate: 'month' },
  { label: 'All', days: Infinity, aggregate: 'month' }
]

// history is sorted oldest-to-newest with 'YYYY-MM-DD' string dates — cutoff
// is computed from the latest snapshot (not "today") so the filter still
// makes sense if the app hasn't been opened today yet.
export function filterHistoryByRange(history, days) {
  if (!Number.isFinite(days) || history.length === 0) return history
  const cutoff = new Date(history[history.length - 1].date)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return history.filter((h) => h.date >= cutoffStr)
}

// One point per calendar month, keeping each field's last known value that
// month (history is already ordered oldest to newest) — reused for long
// ranges so they get a clean, gap-tolerant chart instead of a jagged line
// connecting sparse daily points across months.
//
// Merges fields progressively (later entries in the same month overwrite
// only the keys they carry) rather than keeping one whole row per month —
// that naive version works for a single dense series like net worth
// (every row always has the same fields), but silently drops data for a
// multi-series one like per-holding history, where a given date's row only
// has the keys for whichever holdings happened to snapshot that day. Taking
// just "the last row of the month" there would discard every other
// holding's value if it wasn't also on that exact date.
export function aggregateMonthly(history) {
  const byMonth = new Map()
  for (const entry of history) {
    const month = entry.date.slice(0, 7)
    byMonth.set(month, { ...byMonth.get(month), ...entry, date: month })
  }
  return Array.from(byMonth.values())
}

// Filters to the range, then aggregates monthly when the range calls for
// it — except when every point still falls in the same calendar month
// (common for a new account whose whole history is a few days old), where
// aggregating would collapse everything down to a single point. A chart
// needs at least 2 points to draw a line, so that single point would just
// look broken or blank instead of showing the handful of real days that do
// exist — falling back to the unaggregated daily data is strictly more
// informative there, and is naturally still small (bounded by one month's
// worth of days) so there's no density concern in doing so.
export function applyChartRange(history, rangeLabel) {
  if (!history) return history
  const range = CHART_RANGES.find((r) => r.label === rangeLabel)
  const windowed = filterHistoryByRange(history, range?.days ?? Infinity)
  if (range?.aggregate !== 'month') return windowed
  const aggregated = aggregateMonthly(windowed)
  return aggregated.length > 1 ? aggregated : windowed
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// Full 'YYYY-MM-DD' tick labels are wide enough that Recharts' built-in
// overlap-avoidance (the default `interval` behavior) silently drops
// whichever ones it estimates would collide — which looked like random
// dates going missing from the axis. Shortening the label to 'D/M' (or
// 'Mon 'YY' for monthly-aggregated points, which are 'YYYY-MM') lets every
// tick fit, paired with an explicit `ticks` list (every real data point) so
// Recharts never decides on its own which ones to skip.
export function formatAxisDate(value) {
  if (value.length === 7) {
    const [year, month] = value.split('-')
    return `${MONTH_NAMES[Number(month) - 1]} '${year.slice(2)}`
  }
  const [, month, day] = value.split('-')
  return `${Number(day)}/${Number(month)}`
}
