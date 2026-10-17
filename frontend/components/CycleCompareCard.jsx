'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'

const SELECT = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

// "▲ +12.5%" style change label. goodWhenUp says which direction is good
// (more income is good, more spending is not) to pick green or red.
function Change({ from, to, goodWhenUp, currency, showAmount = false }) {
  const diff = to - from
  if (Math.abs(diff) < 0.005) return <span className="text-xs text-gray-400 dark:text-gray-500">no change</span>
  const good = goodWhenUp ? diff > 0 : diff < 0
  const pct = from ? Math.round((diff / Math.abs(from)) * 1000) / 10 : null
  return (
    <span className={`text-xs font-medium ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {diff > 0 ? '▲' : '▼'} {showAmount ? formatCurrency(Math.abs(diff), currency) : ''}{showAmount && pct !== null ? ' · ' : ''}{pct !== null ? `${diff > 0 ? '+' : ''}${pct}%` : (showAmount ? '' : 'new')}
    </span>
  )
}

// Two budget cycles side by side: income, spending and net, then spending by
// category with what changed — "where did I spend more this time?".
export default function CycleCompareCard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  async function load(a, b) {
    try {
      const params = new URLSearchParams()
      if (a) params.set('a', a)
      if (b) params.set('b', b)
      setData(await request(`/reports/compare-cycles?${params.toString()}`))
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load the comparison')
    }
  }

  useEffect(() => {
    function init() {
      load()
    }
    init()
  }, [])

  if (error) return <p className="text-sm text-red-600 dark:text-red-400 lg:col-span-2">{error}</p>
  if (!data) return null

  const currency = data.displayCurrency
  const currentPeriod = data.options[0]?.period
  const aLabel = `${data.a.label}${data.a.period === currentPeriod ? ' (so far)' : ''}`
  const hasSpending = data.categories.length > 0

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Compare Periods</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">Where your money went differently between two budget cycles</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <select value={data.a.period} onChange={(e) => load(e.target.value, data.b.period)} className={SELECT}>
            {data.options.map((o) => <option key={o.period} value={o.period}>{o.label}</option>)}
          </select>
          vs
          <select value={data.b.period} onChange={(e) => load(data.a.period, e.target.value)} className={SELECT}>
            {data.options.map((o) => <option key={o.period} value={o.period}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[['Income', 'income', true], ['Spending', 'expense', false], ['Net', 'net', true]].map(([label, key, goodWhenUp]) => (
          <div key={key} className="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/40">
            <p className="text-xs uppercase text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-0.5 text-base font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(data.a[key], currency)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-400 dark:text-gray-500">
              <span>vs {formatCurrency(data.b[key], currency)}</span>
              <Change from={data.b[key]} to={data.a[key]} goodWhenUp={goodWhenUp} currency={currency} />
            </p>
          </div>
        ))}
      </div>

      {hasSpending ? (
        <div className="-mx-5 mt-4 max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-5 py-2">Category</th>
                <th className="px-3 py-2 text-right">{aLabel}</th>
                <th className="px-3 py-2 text-right">{data.b.label}</th>
                <th className="px-5 py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.categoryId ?? c.categoryName} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-5 py-2 font-medium text-gray-900 dark:text-gray-100">{c.categoryName}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{c.a ? formatCurrency(c.a, currency) : '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{c.b ? formatCurrency(c.b, currency) : '—'}</td>
                  <td className="px-5 py-2 text-right"><Change from={c.b} to={c.a} goodWhenUp={false} currency={currency} showAmount /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">No spending recorded in either period.</p>
      )}
    </div>
  )
}
