'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'
import CardHeader from '@/components/CardHeader'

// The biggest spending categories this cycle as horizontal bars, with a thin
// tick where each one stood last cycle and how it changed.
export default function TopCategoriesCard({ className = '' }) {
  const [current, setCurrent] = useState(null)
  const [previous, setPrevious] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [now, before] = await Promise.all([
          request('/reports/expense-breakdown?periodOffset=0'),
          request('/reports/expense-breakdown?periodOffset=1')
        ])
        setCurrent(now)
        setPrevious(before)
      } catch (err) {
        setError(err.message || 'Failed to load categories')
      }
    }
    load()
  }, [])

  const currency = current?.displayCurrency
  const previousByKey = new Map((previous?.breakdown || []).map((b) => [b.categoryId ?? 'none', b.amount]))
  const rows = current ? [...current.breakdown].sort((a, b) => b.amount - a.amount).slice(0, 6) : []
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.amount, previousByKey.get(r.categoryId ?? 'none') || 0)))

  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 ${className}`}>
      <CardHeader icon={ShoppingBag} color="blue" title="Top spending" subtitle={current?.periodLabel ? `${current.periodLabel} · tick = last cycle` : undefined} />
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !current ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700/50" />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">No spending in this cycle yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const before = previousByKey.get(row.categoryId ?? 'none')
            const change = before ? Math.round(((row.amount - before) / before) * 100) : null
            return (
              <li key={row.categoryId ?? 'none'}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-gray-700 dark:text-gray-300">{row.categoryName}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    {change !== null && (
                      <span className={change > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                        {change > 0 ? '▲' : change < 0 ? '▼' : ''} {Math.abs(change)}%
                      </span>
                    )}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(row.amount, currency)}</span>
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className="h-full rounded-full bg-[#3e6fd1] dark:bg-[#5b8def]" style={{ width: `${(row.amount / scale) * 100}%` }} />
                  {before > 0 && (
                    <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-gray-500 dark:bg-gray-300" style={{ left: `calc(${(before / scale) * 100}% - 1px)` }} title={`Last cycle: ${formatCurrency(before, currency)}`} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
