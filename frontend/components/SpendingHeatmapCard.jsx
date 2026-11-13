'use client'

import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'
import CardHeader from '@/components/CardHeader'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const SELECT = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const parseDay = (key) => new Date(`${key}T00:00:00`)
const dayLabel = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// A calendar of one budget cycle where each day is shaded by how much was
// spent on it, so the heavy days stand out at a glance.
export default function SpendingHeatmapCard({ className = '' }) {
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result = await request(`/reports/cycle-trend?periodOffset=${offset}`)
        if (!cancelled) {
          setData(result)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load spending days')
      }
    }
    load()
    return () => { cancelled = true }
  }, [offset])

  let cells = []
  let max = 0
  let biggest = null
  if (data) {
    const start = parseDay(data.startDate)
    // The trend is running totals; a day's own spending is the step from the day before.
    const spent = data.days.map((d, i) => Math.max(0, d.expense - (i > 0 ? data.days[i - 1].expense : 0)))
    max = Math.max(0, ...spent)
    const lead = (start.getDay() + 6) % 7 // Monday first
    cells = Array.from({ length: lead }, () => null)
    for (let i = 0; i < data.totalDays; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      const amount = i < spent.length ? spent[i] : null
      cells.push({ date, amount })
      if (amount !== null && amount === max && max > 0 && !biggest) biggest = { date, amount }
    }
  }

  const shade = (amount) => {
    if (amount === null) return { className: 'bg-transparent ring-1 ring-inset ring-gray-100 dark:ring-gray-700/60' }
    if (amount === 0) return { className: 'bg-gray-100 dark:bg-gray-700/60' }
    const alpha = 0.2 + 0.8 * (amount / max)
    return { className: '', style: { backgroundColor: `rgb(224 112 95 / ${alpha.toFixed(2)})` } }
  }

  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 ${className}`}>
      <CardHeader
        icon={CalendarDays}
        color="red"
        title="Spending by day"
        subtitle={data?.periodLabel}
        action={
          <select value={offset} onChange={(e) => setOffset(Number(e.target.value))} aria-label="Cycle" className={SELECT}>
            <option value={0}>This cycle</option>
            <option value={1}>Last cycle</option>
            <option value={2}>2 cycles ago</option>
          </select>
        }
      />
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !data ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700/50" />
      ) : max === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">No spending in this cycle yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-gray-400 dark:text-gray-500">
            {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {cells.map((cell, i) => {
              if (!cell) return <div key={i} />
              const { className: cls, style } = shade(cell.amount)
              return (
                <div
                  key={i}
                  title={`${dayLabel(cell.date)}${cell.amount === null ? '' : ` · ${formatCurrency(cell.amount, data.displayCurrency)}`}`}
                  className={`flex aspect-square items-center justify-center rounded-md text-[10px] text-gray-500 dark:text-gray-400 ${cls}`}
                  style={style}
                >
                  {cell.date.getDate()}
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            {biggest ? <span>Biggest day: {dayLabel(biggest.date)} · {formatCurrency(biggest.amount, data.displayCurrency)}</span> : <span />}
            <span className="flex items-center gap-1">
              Less
              {[0.2, 0.45, 0.7, 1].map((a) => <span key={a} className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: `rgb(224 112 95 / ${a})` }} />)}
              More
            </span>
          </div>
        </>
      )}
    </div>
  )
}
