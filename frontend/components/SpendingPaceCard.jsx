'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Gauge } from 'lucide-react'
import { formatCurrency, formatCompact } from '@/lib/format'
import CardHeader from '@/components/CardHeader'

const THIS_CYCLE = '#2563eb'
const GUIDE = 'var(--chart-axis, #9ca3af)'
const OVER = '#ef4444'

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Spending this cycle, day by day, answered two ways:
// - All spending: against the previous cycle on the same day of its cycle —
//   "am I spending faster or slower than usual?"
// - Budget: only the categories with a budget this cycle, against their total
//   limit — how much of the budget is used and how much is left.
// Either headline compares at today's point, while there's still time to act.
export default function SpendingPaceCard({ current, previous, budgeted, currency, className = '' }) {
  const hasBudget = Boolean(budgeted?.budget && budgeted.budget.limit > 0)
  const [chosenView, setView] = useState(null)
  const view = chosenView || (hasBudget ? 'budget' : 'all')
  if (!current) return null

  const start = new Date(`${current.startDate}T00:00:00`)
  const totalDays = current.totalDays || current.days.length
  const source = view === 'budget' && hasBudget ? budgeted : current
  const length = view === 'budget' ? totalDays : Math.max(totalDays, previous?.days.length || 0)
  const limit = hasBudget ? budgeted.budget.limit : 0
  const previousAt = (i) => {
    if (!previous?.days.length) return null
    return (previous.days[Math.min(i, previous.days.length - 1)] || {}).expense ?? null
  }
  const rows = Array.from({ length }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return {
      day: i + 1,
      date: dayKey(date),
      current: source.days[i] ? source.days[i].expense : null,
      guide: view === 'budget' ? null : previousAt(i)
    }
  })

  // Fixed axis labels: the first day, every fifth day after it, and the
  // last — the same dates every time instead of whatever fits.
  const ticks = rows.filter((r, i) => i % 5 === 0 || i === rows.length - 1).map((r) => r.date)
  if (ticks.length > 2 && rows.length - 1 - (ticks.length - 2) * 5 < 3) ticks.splice(ticks.length - 2, 1)

  const dayNow = source.days.length
  const finished = dayNow >= totalDays
  const spent = dayNow > 0 ? source.days[dayNow - 1].expense : 0

  let headline
  let detail
  let tone = 'neutral'
  if (view === 'budget') {
    headline = <>{formatCurrency(spent, currency)} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">spent of {formatCurrency(limit, currency)} budget</span></>
    if (spent > limit) {
      tone = 'bad'
      detail = `Over budget by ${formatCurrency(spent - limit, currency)}`
    } else {
      tone = 'good'
      detail = `${formatCurrency(limit - spent, currency)} left`
    }
  } else {
    const hasPrevious = previous?.days.some((d) => d.expense > 0)
    const lastByNow = dayNow > 0 ? previousAt(dayNow - 1) : null
    const diff = hasPrevious && lastByNow !== null ? spent - lastByNow : null
    headline = <>{formatCurrency(spent, currency)} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">spent {finished ? 'this cycle' : 'so far'}</span></>
    if (spent === 0 && !finished) {
      // Nothing spent yet, so "less than last cycle" would be true by default.
      detail = 'No spending recorded yet this cycle'
    } else if (diff === null) {
      detail = 'No spending from last cycle to compare with yet.'
    } else {
      tone = diff <= 0 ? 'good' : 'bad'
      detail = finished
        ? `${formatCurrency(Math.abs(diff), currency)} ${diff <= 0 ? 'less' : 'more'} than last cycle`
        : `${formatCurrency(Math.abs(diff), currency)} ${diff <= 0 ? 'less' : 'more'} than at this point last cycle`
    }
  }
  const toneClass = tone === 'good' ? 'font-medium text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'
  const showGuide = rows.some((r) => r.guide)
  const anything = spent > 0 || showGuide || view === 'budget'
  const lineColor = view === 'budget' && spent > limit ? OVER : THIS_CYCLE

  return (
    <div className={`flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 ${className}`}>
      <CardHeader
        icon={Gauge}
        color="blue"
        title="Spending Pace"
        subtitle={finished ? current.periodLabel : `Day ${dayNow} of ${totalDays} · ${current.periodLabel}`}
        action={
          <div className="flex rounded-lg border border-gray-300 p-0.5 text-xs dark:border-gray-600">
            {[['all', 'All spending'], ['budget', 'Budget']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`rounded-md px-2 py-0.5 font-medium ${view === key ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      {view === 'budget' && !hasBudget ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <Gauge size={24} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No budgets for this cycle yet.</p>
          <Link href="/budgets" className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">Set a budget</Link>
        </div>
      ) : !anything ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-8 text-center">
          <Gauge size={24} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No spending recorded yet — your pace shows up as you add expenses.</p>
        </div>
      ) : (
        <>
          <div className="-mt-1 mb-2">
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{headline}</p>
            <p className={`text-xs ${toneClass}`}>{detail}</p>
          </div>
          <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: lineColor }} /> {view === 'budget' ? 'Spent' : 'This cycle'}</span>
            {showGuide && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-gray-400 dark:border-gray-500" /> Last cycle
              </span>
            )}
            {view === 'budget' && <span className="truncate text-gray-400 dark:text-gray-500">Counts: {budgeted.budget.categories.join(', ')}</span>}
          </div>
          <div className="min-h-[150px] flex-1 lg:min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pace-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} ticks={ticks} interval={0} tickFormatter={(d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={48} domain={view === 'budget' ? [0, (max) => Math.max(max, limit) * 1.05] : [0, 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)', fontSize: 12 }}
                  labelFormatter={(d, payload) => `Day ${payload?.[0]?.payload?.day ?? ''} · ${new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`}
                  formatter={(value, name) => [formatCurrency(value, currency), name]}
                />
                {view === 'budget' && (
                  <ReferenceLine y={limit} stroke={OVER} strokeOpacity={0.6} strokeDasharray="2 3" label={{ value: 'Budget limit', position: 'insideTopLeft', fontSize: 10, fill: OVER }} />
                )}
                {showGuide && (
                  <Line type="monotone" dataKey="guide" name="Last cycle" stroke={GUIDE} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
                )}
                <Area type="monotone" dataKey="current" name={view === 'budget' ? 'Spent' : 'This cycle'} stroke={lineColor} strokeWidth={2.5} fill="url(#pace-fill)" dot={false} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
