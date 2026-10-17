'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'
import ScrollFadeBox from '@/components/ScrollFadeBox'
import { formatCurrency, formatNumber } from '@/lib/format'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1']
const OTHER_COLOR = '#9ca3af'
// Beyond this many currencies, the smallest are shown together as "Other".
const MAX_CARDS = 6
const SELECT = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

// Rates read as "1 TWD = Rp 554,66"; tiny ones (e.g. IDR shown in USD) keep
// enough digits to be visible.
// "2 accounts · 1 holding" for a currency card.
const countLabel = (items) => {
  const accounts = items.filter((i) => i.kind === 'account').length
  const holdings = items.filter((i) => i.kind === 'holding').length
  return [
    accounts ? `${accounts} account${accounts === 1 ? '' : 's'}` : null,
    holdings ? `${holdings} holding${holdings === 1 ? '' : 's'}` : null
  ].filter(Boolean).join(' · ')
}

const formatRate = (rate) => formatNumber(Number(rate.toPrecision(rate < 1 ? 3 : 6)))

// How much of what you own sits in each currency, and how much exchange-rate
// moves alone have changed its worth since a budget cycle began.
export default function CurrencyExposureCard({ wide = false }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  async function load(sinceOffset) {
    try {
      setData(await request(`/reports/currency-exposure${sinceOffset !== undefined ? `?sinceOffset=${sinceOffset}` : ''}`))
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load currency exposure')
    }
  }

  useEffect(() => {
    function init() {
      load()
    }
    init()
  }, [])

  if (error) return <p className="text-sm text-red-600 dark:text-red-400 lg:col-span-2">{error}</p>
  if (!data || data.exposure.length === 0) return null

  const currency = data.displayCurrency
  const colored = data.exposure.map((e, i) => ({ ...e, color: COLORS[i % COLORS.length] }))
  const foreign = colored.filter((e) => e.currency !== currency)
  const impact = data.fxImpact

  // Keep the biggest currencies as their own cards and fold the rest into
  // one "Other" card, so many small currencies don't make a wall of cards.
  let exposure = colored
  if (colored.length > MAX_CARDS) {
    const kept = colored.slice(0, MAX_CARDS - 1)
    const rest = colored.slice(MAX_CARDS - 1)
    exposure = [...kept, {
      currency: 'Other',
      label: rest.map((e) => e.currency).join(', '),
      value: rest.reduce((sum, e) => sum + e.value, 0),
      percentage: Math.round(rest.reduce((sum, e) => sum + e.percentage, 0) * 10) / 10,
      items: rest.flatMap((e) => e.items.map((item) => ({ ...item, name: `${item.name} (${e.currency})` }))),
      isOther: true,
      color: OTHER_COLOR
    }]
  }

  return (
    <div className={`flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 ${wide ? 'lg:col-span-2' : 'lg:h-[460px]'}`}>
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Currency Exposure</h2>
      <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">How your money is split across currencies, valued in {currency}</p>

      <ScrollFadeBox className="pr-1">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        {exposure.filter((e) => e.value > 0).map((e) => (
          <div key={e.currency} title={`${e.currency}: ${e.percentage}%`} style={{ width: `${Math.max(0, e.percentage)}%`, backgroundColor: e.color }} />
        ))}
      </div>

      <ul className={`mt-3 grid grid-cols-2 gap-2 ${wide ? 'sm:grid-cols-3' : ''}`}>
        {exposure.map((e) => (
          <li key={e.currency} title={e.items.map((item) => (e.isOther ? item.name : `${item.name}: ${formatNumber(item.amount)} ${e.currency}`)).join('\n')} className="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/40">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
              {e.currency}
              <span className="ml-auto text-gray-900 dark:text-gray-100">{e.value < 0 ? 'owed' : `${e.percentage}%`}</span>
            </p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(e.value, currency)}</p>
            {(e.isOther || e.currency !== currency) && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{e.isOther ? e.label : formatCurrency(e.amount, e.currency)}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500">{countLabel(e.items)}</p>
          </li>
        ))}
      </ul>
      {data.unconverted?.length > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Not included: {data.unconverted.join(', ')} — there&apos;s no exchange rate for {data.unconverted.length === 1 ? 'it' : 'them'} yet.
        </p>
      )}

      {foreign.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Exchange-rate effect</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">How much your foreign-currency money changed in {currency} only because rates moved</p>
            </div>
            {data.sinceOptions.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Since the start of
                <select value={data.since?.offset ?? ''} onChange={(e) => load(Number(e.target.value))} className={SELECT}>
                  {data.sinceOptions.map((o) => <option key={o.offset} value={o.offset}>{o.label}</option>)}
                </select>
              </label>
            )}
          </div>

          {impact ? (
            <>
              <p className={`mt-2 text-xl font-semibold ${impact.total >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {impact.total >= 0 ? '+' : '−'}{formatCurrency(Math.abs(impact.total), currency)}
              </p>
              <ul className="mt-2 space-y-1.5">
                {impact.byCurrency.map((c) => (
                  <li key={c.currency} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      1 {c.currency}: {formatRate(c.rateThen)} → {formatRate(c.rateNow)} {currency}
                      <span className={`ml-1.5 text-xs font-medium ${c.rateChangePercentage >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {c.rateChangePercentage > 0 ? '+' : ''}{c.rateChangePercentage}%
                      </span>
                    </span>
                    <span className={`font-medium ${c.impact >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {c.impact >= 0 ? '+' : '−'}{formatCurrency(Math.abs(c.impact), currency)}
                    </span>
                  </li>
                ))}
              </ul>
              {impact.noHistory?.length > 0 && (
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Not counted here: {impact.noHistory.join(', ')} — no saved rate from that date yet.</p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">Not enough exchange-rate history yet — it builds up one day at a time.</p>
          )}
        </div>
      )}
      </ScrollFadeBox>
    </div>
  )
}
