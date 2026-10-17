'use client'

import { useEffect, useState, useMemo } from 'react'
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Brush } from 'recharts'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatNumber } from '@/lib/format'
import { CHART_RANGES, applyChartRange, formatAxisDate, withTimestamps } from '@/lib/chartRanges'
import TrendAreaChart from '@/components/TrendAreaChart'
import TargetAllocationCard from '@/components/TargetAllocationCard'
import CycleCompareCard from '@/components/CycleCompareCard'
import CurrencyExposureCard from '@/components/CurrencyExposureCard'


// Recharts' Tooltip takes literal colors via contentStyle, not Tailwind
// classes — these CSS variables (defined in globals.css) are the dark-mode
// bridge for it, same idea as the chart grid color used below.
const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--tooltip-text)'
}

// Falls back to the earliest snapshot when the target date predates all
// history, so "this year"/"this month" still shows a change even for an
// account younger than that period.
function closestOnOrBefore(history, targetDate) {
  const before = history.filter((h) => new Date(h.date) <= targetDate)
  return before.length > 0 ? before[before.length - 1] : history[0]
}

function pctChange(from, to) {
  if (!from) return null
  return Math.round(((to - from) / from) * 1000) / 10
}

// "This Cycle" is not computed here: it comes from the dashboard summary, so
// it follows the budget cycle (and salary counted in the next cycle) exactly
// like the Dashboard's net worth change does.
function computeSummaryChanges(history) {
  if (!history || history.length === 0) return null
  const latest = history[history.length - 1]
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  return {
    thisYear: pctChange(closestOnOrBefore(history, startOfYear).netWorth, latest.netWorth),
    allTime: pctChange(history[0].netWorth, latest.netWorth)
  }
}

// One row per calendar month, keeping that month's last snapshot as its
// value (history is already ordered oldest to newest) — mirrors the "Log
// Bulanan" monthly log from the spreadsheet this feature replaced.
function computeMonthlyBreakdown(history) {
  if (!history || history.length === 0) return []
  const byMonth = new Map()
  for (const entry of history) {
    byMonth.set(entry.date.slice(0, 7), entry)
  }
  const rows = Array.from(byMonth.entries()).map(([month, entry]) => ({
    month,
    netWorth: entry.netWorth,
    displayCurrency: entry.displayCurrency
  }))
  return rows.map((row, i) => {
    const prev = rows[i - 1]
    return {
      ...row,
      changeAmount: prev ? row.netWorth - prev.netWorth : null,
      changePercent: prev ? pctChange(prev.netWorth, row.netWorth) : null
    }
  })
}

function SummaryChangeCard({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-3 text-center">
      <p className="text-xs uppercase text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${value === null ? 'text-gray-400 dark:text-gray-500' : value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
        {value === null ? 'N/A' : `${value >= 0 ? '+' : ''}${value}%`}
      </p>
    </div>
  )
}

export default function ReportsPage() {
  const [netWorthHistory, setNetWorthHistory] = useState(null)
  const [targetAllocation, setTargetAllocation] = useState(null)
  const [cycleSummary, setCycleSummary] = useState(null)
  const [nwRange, setNwRange] = useState('All')
  const [chartType, setChartType] = useState('line')
  const [showMonthlyDetail, setShowMonthlyDetail] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState('')

  const filteredNetWorthHistory = useMemo(() => (
    applyChartRange(netWorthHistory, nwRange)
  ), [netWorthHistory, nwRange])
  const netWorthTimeSeries = useMemo(() => (
    filteredNetWorthHistory ? withTimestamps(filteredNetWorthHistory) : []
  ), [filteredNetWorthHistory])

  useEffect(() => {
    async function load() {
      try {
        const [historyData, targetData, summaryData] = await Promise.all([
          request('/reports/net-worth-history'),
          request('/investments/allocation-targets'),
          request('/reports/dashboard')
        ])
        setCycleSummary(summaryData)
        setNetWorthHistory(historyData.history)
        setTargetAllocation(targetData)
      } catch (err) {
        setLoadError(err.message || 'Failed to load reports')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function loadTargetAllocation(compareOffset) {
    try {
      setTargetAllocation(await request(`/investments/allocation-targets?compareOffset=${compareOffset}`))
    } catch (err) {
      setLoadError(err.message || 'Failed to load allocation')
    }
  }

  async function handleExport(format) {
    setExportError('')
    setExporting(format)
    try {
      const blob = await request(`/reports/export?format=${format}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = format === 'pdf' ? 'nextgen-wealth-report.pdf' : 'nextgen-wealth-report.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err.message || 'Failed to export report')
    } finally {
      setExporting('')
    }
  }

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading reports...</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Reports</h1>
        <div className="flex gap-2">
          <button onClick={() => handleExport('pdf')} disabled={exporting === 'pdf'} className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50">
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
          <button onClick={() => handleExport('excel')} disabled={exporting === 'excel'} className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50">
            {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {exportError && <p className="text-sm text-red-600 dark:text-red-400">{exportError}</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CycleCompareCard />

        {/* Side by side with Target vs Actual; full width when that card is hidden. */}
        <CurrencyExposureCard wide={!!targetAllocation && targetAllocation.comparison.length === 0 && !(Number(targetAllocation.totalValue) > 0)} />

        <TargetAllocationCard data={targetAllocation} onCompareChange={loadTargetAllocation} onSaved={setTargetAllocation} />

        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Net Worth History</h2>
            {netWorthHistory && netWorthHistory.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => setChartType('line')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                      chartType === 'line' ? 'bg-gray-800 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                      chartType === 'bar' ? 'bg-gray-800 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Bar
                  </button>
                </div>
                <div className="flex gap-1">
                  {CHART_RANGES.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => setNwRange(r.label)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                        nwRange === r.label ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {netWorthHistory && netWorthHistory.length > 1 ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <SummaryChangeCard label="This Cycle" value={cycleSummary?.changes?.netWorth ?? null} />
                <SummaryChangeCard label="This Year" value={computeSummaryChanges(netWorthHistory).thisYear} />
                <SummaryChangeCard label="All-Time" value={computeSummaryChanges(netWorthHistory).allTime} />
              </div>

              <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
                {filteredNetWorthHistory.length} data points · {filteredNetWorthHistory[0]?.date} – {filteredNetWorthHistory[filteredNetWorthHistory.length - 1]?.date}
              </p>

              {filteredNetWorthHistory.length > 1 ? (
                // Brush (Recharts' built-in zoom/pan slider) replaces the old
                // drag-to-scroll wrapper — drag its handles to zoom into a
                // range instead of needing extra width and a manual scrollbar.
                <ResponsiveContainer width="100%" height={280}>
                  {chartType === 'bar' ? (
                    <BarChart data={filteredNetWorthHistory} margin={{ top: 10, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="date" fontSize={12} tickFormatter={formatAxisDate} />
                      <YAxis fontSize={12} domain={['auto', 'auto']} tickFormatter={formatNumber} width={130} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value, name, props) => formatCurrency(value, props.payload.displayCurrency)} />
                      <Bar dataKey="netWorth" name="Net Worth" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Brush dataKey="date" height={26} stroke="var(--chart-grid)" fill="var(--tooltip-bg)" tickFormatter={formatAxisDate} travellerWidth={10} />
                    </BarChart>
                  ) : (
                    <TrendAreaChart
                      data={netWorthTimeSeries}
                      dataKey="netWorth"
                      name="Net Worth"
                      height={280}
                      formatValue={(value, row) => formatCurrency(value, row.displayCurrency)}
                      formatAxisValue={formatNumber}
                    />
                  )}
                </ResponsiveContainer>
              ) : (
                // Recharts' auto Y-axis domain can misbehave (duplicate/garbled
                // tick labels) when there's only one point to plot after
                // filtering/aggregation — showing a plain message here is safer
                // than letting it attempt a broken render.
                <div className="flex h-[380px] items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                  Only one data point in this range — try a wider range.
                </div>
              )}

              <button
                onClick={() => setShowMonthlyDetail((v) => !v)}
                className="mt-4 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800"
              >
                {showMonthlyDetail ? 'Hide Detail' : 'Show Detail'}
              </button>

              {showMonthlyDetail && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="py-2 pr-4">Month</th>
                        <th className="py-2 pr-4">Net Worth</th>
                        <th className="py-2 pr-4">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computeMonthlyBreakdown(netWorthHistory).map((row) => (
                        <tr key={row.month} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{row.month}</td>
                          <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">{formatCurrency(row.netWorth, row.displayCurrency)}</td>
                          <td className={`py-2 pr-4 font-medium ${
                            row.changePercent === null ? 'text-gray-400 dark:text-gray-500' : row.changePercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {row.changePercent === null
                              ? '—'
                              : `${row.changeAmount >= 0 ? '+' : ''}${formatCurrency(row.changeAmount, row.displayCurrency)} (${row.changePercent >= 0 ? '+' : ''}${row.changePercent}%)`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
              Your net worth history starts building from today: a point is saved each day, so this chart fills in over the coming days.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
