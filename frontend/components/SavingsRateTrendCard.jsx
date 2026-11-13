'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PiggyBank } from 'lucide-react'
import { request } from '@/lib/apiClient'
import CardHeader from '@/components/CardHeader'
import { CHART_TOOLTIP_STYLE, AXIS_TICK, GRID_STROKE, INCOME_COLOR } from '@/lib/chartStyle'

const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })

// Share of income kept, cycle by cycle over the last year: net ÷ income.
// A cycle with no income has no rate, so its point is left out of the line.
export default function SavingsRateTrendCard({ className = '' }) {
  const [points, setPoints] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await request('/reports/trends?months=12')
        setPoints(data.trends.map((t) => ({
          month: t.month,
          label: t.periodLabel,
          rate: t.income > 0 ? Math.round((t.net / t.income) * 1000) / 10 : null
        })))
      } catch (err) {
        setError(err.message || 'Failed to load savings rate')
      }
    }
    load()
  }, [])

  const withRate = points ? points.filter((p) => p.rate !== null) : []
  const latest = withRate[withRate.length - 1]
  const average = withRate.length > 0 ? Math.round((withRate.reduce((s, p) => s + p.rate, 0) / withRate.length) * 10) / 10 : null

  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 ${className}`}>
      <CardHeader
        icon={PiggyBank}
        color="amber"
        title="Savings rate"
        subtitle={average !== null ? `Average ${average}% over ${withRate.length} cycles` : 'Share of income you keep, per cycle'}
        action={latest ? <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{latest.rate}%</span> : null}
      />
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !points ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700/50" />
      ) : withRate.length < 2 ? (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Needs income in at least two cycles.</p>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={monthLabel} interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelFormatter={(key) => points.find((p) => p.month === key)?.label || key}
                formatter={(value) => [`${value}%`, 'Savings rate']}
              />
              <Line type="monotone" dataKey="rate" stroke={INCOME_COLOR} strokeWidth={2} dot={{ r: 3, fill: INCOME_COLOR, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
