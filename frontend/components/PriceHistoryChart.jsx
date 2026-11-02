'use client'

import { useMemo, useState } from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { CHART_RANGES, historyInRange, withTimestamps, timeAxisTicks, timeAxisFormatter, timeTooltipFormatter } from '@/lib/chartRanges'
import { formatCurrency, formatNumber, formatQuantity } from '@/lib/format'

const PRICE = '#3b82f6'
const BUY = '#10b981'
const SELL = '#ef4444'
const TICK = { fontSize: 12, fill: 'var(--chart-axis, #9ca3af)' }

const localDay = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Price per unit over time against what the user paid on average: the market
// line, the average price as a dashed level (below it means a loss), and a
// dot on each day something was bought (green) or sold (red). A trade on a
// day with no close (a weekend for a stock) sits on the last close before it.
// Past MAX_MARKERS trade days in view the dots would bury the line, so they
// start hidden there (a button shows them) and come back on shorter ranges.
const MAX_MARKERS = 15

export default function PriceHistoryChart({ points, currency, averagePrice, trades, source }) {
  const [range, setRange] = useState('All')
  const [showTrades, setShowTrades] = useState(null)

  const rows = useMemo(() => {
    const shown = historyInRange(points, range) || []
    if (shown.length === 0) return []
    const byDate = new Map(shown.map((p) => [p.date, { ...p, trades: [] }]))
    const dates = shown.map((p) => p.date)
    for (const t of trades) {
      const day = localDay(t.occurredAt)
      if (day < dates[0]) continue
      let target = null
      for (const date of dates) {
        if (date > day) break
        target = date
      }
      if (target) byDate.get(target).trades.push(t)
    }
    return withTimestamps(dates.map((date) => byDate.get(date)))
  }, [points, trades, range])

  if (!points || points.length < 2) {
    return <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Not enough price history yet — it fills in as prices are saved each day.</p>
  }

  const values = rows.map((r) => r.price)
  if (averagePrice) values.push(averagePrice)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.1 || max * 0.02 || 1
  const tradeDays = rows.filter((r) => r.trades.length > 0).length
  const tradesVisible = showTrades ?? tradeDays <= MAX_MARKERS
  const formatDate = timeTooltipFormatter(rows)
  const last = rows[rows.length - 1]
  const vsAverage = averagePrice ? Math.round(((last.price - averagePrice) / averagePrice) * 1000) / 10 : null

  const renderDot = ({ cx, cy, payload, index }) => {
    if (!tradesVisible || !payload.trades.length) return <g key={`d${index}`} />
    const sold = payload.trades.some((t) => t.type === 'sell')
    return <circle key={`d${index}`} cx={cx} cy={cy} r={4.5} fill={sold ? SELL : BUY} stroke="var(--tooltip-bg)" strokeWidth={2} />
  }

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const row = payload[0].payload
    const diff = averagePrice ? Math.round(((row.price - averagePrice) / averagePrice) * 1000) / 10 : null
    return (
      <div className="rounded-lg border border-[var(--tooltip-border)] bg-[var(--tooltip-bg)] px-3 py-2 text-sm text-[var(--tooltip-text)] shadow-md">
        <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(label)}</p>
        <p className="font-semibold">Price: {formatCurrency(row.price, currency)}</p>
        {diff !== null && (
          <p className={`text-xs font-medium ${diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {diff >= 0 ? '+' : ''}{diff}% vs your average
          </p>
        )}
        {row.trades.map((t) => (
          <p key={t.id} className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium" style={{ color: t.type === 'sell' ? SELL : BUY }}>{t.type === 'sell' ? 'Sold' : 'Bought'}</span>{' '}
            {formatQuantity(t.quantity)} at {formatCurrency(t.pricePerUnit, currency)}
          </p>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: PRICE }} /> <span className="font-medium text-gray-700 dark:text-gray-300">Price</span></span>
          {averagePrice && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-gray-400 dark:border-gray-500" />
              <span className="font-medium text-gray-700 dark:text-gray-300">Your average</span> {formatCurrency(averagePrice, currency)}
            </span>
          )}
          {tradeDays > 0 && (
            <button
              onClick={() => setShowTrades(!tradesVisible)}
              title={tradesVisible ? 'Hide buy/sell dots' : 'Show buy/sell dots'}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${tradesVisible ? 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300' : 'border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tradesVisible ? BUY : 'currentColor' }} /> Buy
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tradesVisible ? SELL : 'currentColor' }} /> Sell
              <span className="text-gray-400 dark:text-gray-500">· {tradesVisible ? 'shown' : `${tradeDays} days hidden`}</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {CHART_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => { setRange(r.label); setShowTrades(null) }}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${range === r.label ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {vsAverage !== null && (
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          Now {formatCurrency(last.price, currency)} —{' '}
          <span className={`font-medium ${vsAverage >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {vsAverage >= 0 ? `${vsAverage}% above` : `${Math.abs(vsAverage)}% below`}
          </span>{' '}
          the average price you paid.
        </p>
      )}
      {rows.length > 1 ? (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={rows} margin={{ top: 10, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={timeAxisTicks(rows, 7)}
              tickFormatter={timeAxisFormatter(rows)}
              tick={TICK}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              orientation="right"
              domain={[min - pad, max + pad]}
              tickFormatter={(v) => formatNumber(Math.round(v * 100) / 100)}
              tick={TICK}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            {averagePrice && <ReferenceLine y={averagePrice} stroke="var(--chart-axis, #9ca3af)" strokeDasharray="6 4" strokeWidth={1.5} />}
            <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--chart-axis, #9ca3af)', strokeWidth: 1 }} />
            <Line
              type="linear"
              dataKey="price"
              stroke={PRICE}
              strokeWidth={2}
              dot={renderDot}
              activeDot={{ r: 4, fill: PRICE, stroke: 'var(--tooltip-bg)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">No prices in this range.</p>
      )}
      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        {source === 'market' ? 'Daily closing prices from the market.' : 'Prices worked out from the values saved in the app each day.'}
      </p>
    </>
  )
}
