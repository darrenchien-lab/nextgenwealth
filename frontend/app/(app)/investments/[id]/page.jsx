'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Layers, Wallet, TrendingUp, Receipt, History, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, CalendarRange, CalendarDays } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatQuantity } from '@/lib/format'
import CardHeader from '@/components/CardHeader'
import SummaryCard from '@/components/SummaryCard'

const ASSET_TYPE_LABELS = { stock: 'Stock', mutual_fund: 'Mutual Fund', crypto: 'Crypto', etf: 'ETF', bond: 'Bond', gold: 'Gold', property: 'Property', other: 'Other' }

function gainClass(value) {
  if (value === null || value === undefined) return 'text-gray-400 dark:text-gray-500'
  return value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
}

function signed(value, currency) {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value, currency)}`
}

// 'YYYY-MM' of a trade, in local time.
const monthKey = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const tradeDay = (value) => dayKey(new Date(value))
// The latest end allowed for a range starting on `from`: one calendar month on.
const oneMonthAfter = (from) => {
  const d = new Date(`${from}T00:00:00`)
  return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()))
}
const defaultRange = () => {
  const today = new Date()
  return { from: dayKey(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())), to: dayKey(today) }
}
const shortDate = (key) => new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export default function HoldingDetailPage() {
  const { id } = useParams()
  const [holding, setHolding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await request(`/investments/${id}/detail`)
        setHolding(data.holding)
      } catch (err) {
        setError(err.message || 'Failed to load this holding')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const currency = holding?.currency

  // Trades are shown for one stretch at a time (a long history would
  // otherwise be a wall of rows), picked one of two ways: a date range of up
  // to one month (the last month by default), or a calendar month that has
  // trades, for going further back.
  const [filterMode, setFilterMode] = useState('range')
  const [range, setRange] = useState(defaultRange)
  const [month, setMonth] = useState(null)
  const months = useMemo(() => {
    const counts = new Map()
    for (const t of holding?.transactions || []) {
      const key = monthKey(t.occurredAt)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [holding])
  const shownMonth = month && months.some(([key]) => key === month) ? month : months[0]?.[0] || null
  const monthIndex = months.findIndex(([key]) => key === shownMonth)
  const rangeError = range.from > range.to
    ? 'The start date is after the end date.'
    : range.to > oneMonthAfter(range.from) ? 'Pick a range of up to one month.' : ''
  const shownTransactions = (holding?.transactions || []).filter((t) => (filterMode === 'month'
    ? monthKey(t.occurredAt) === shownMonth
    : !rangeError && tradeDay(t.occurredAt) >= range.from && tradeDay(t.occurredAt) <= range.to))
  const periodLabel = filterMode === 'month' ? (shownMonth ? monthLabel(shownMonth) : '') : `${shortDate(range.from)} – ${shortDate(range.to)}`
  const monthBought = shownTransactions.filter((t) => t.type === 'buy').reduce((sum, t) => sum + Number(t.totalAmount), 0)
  const monthSold = shownTransactions.filter((t) => t.type === 'sell').reduce((sum, t) => sum + Number(t.totalAmount), 0)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/investments" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400">
          <ArrowLeft size={14} /> Investments
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{holding ? holding.assetName : 'Holding'}</h1>
            {holding && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {[ASSET_TYPE_LABELS[holding.assetType] || holding.assetType, holding.category, holding.currency, holding.isClosed ? 'Closed' : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {holding && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Last price <span className="ml-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(holding.currentPrice, currency)}</span>
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>}

      {holding && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard icon={Layers} color="slate" label="Quantity" value={formatQuantity(holding.quantity)} />
            <SummaryCard icon={Wallet} color="blue" label="Value" value={formatCurrency(holding.value, currency)} />
            <SummaryCard icon={TrendingUp} color={holding.unrealizedGain >= 0 ? 'emerald' : 'red'} label="Unrealized P/L (after fees)" value={signed(holding.unrealizedGain, currency)} change={holding.returnPercentage} />
            <SummaryCard icon={Receipt} color="amber" label="Fees paid" value={formatCurrency(holding.feesTotal, currency)} />
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <CardHeader icon={Wallet} color="violet" title="Cost basis" subtitle="With fees is what actually left your account; without fees matches most broker apps" />
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3"></th>
                    <th className="px-5 py-3 text-right">With fees</th>
                    <th className="px-5 py-3 text-right">Without fees</th>
                  </tr>
                </thead>
                <tbody className="text-gray-900 dark:text-gray-100">
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Cost basis</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium">{formatCurrency(holding.costBasis, currency)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">{formatCurrency(holding.costBasisExcludingFees, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Average price</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium">{holding.averagePrice === null ? '-' : formatCurrency(holding.averagePrice, currency)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">{holding.averagePriceExcludingFees === null ? '-' : formatCurrency(holding.averagePriceExcludingFees, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Unrealized P/L</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-medium ${gainClass(holding.unrealizedGain)}`}>{signed(holding.unrealizedGain, currency)}</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right ${gainClass(holding.unrealizedGainExcludingFees)}`}>{signed(holding.unrealizedGainExcludingFees, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Return</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-medium ${gainClass(holding.returnPercentage)}`}>{holding.returnPercentage === null ? '-' : `${holding.returnPercentage >= 0 ? '+' : ''}${holding.returnPercentage}%`}</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right ${gainClass(holding.returnPercentageExcludingFees)}`}>{holding.returnPercentageExcludingFees === null ? '-' : `${holding.returnPercentageExcludingFees >= 0 ? '+' : ''}${holding.returnPercentageExcludingFees}%`}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <CardHeader
              icon={History}
              color="violet"
              title="Transaction history"
              subtitle={`${holding.transactions.length} trade${holding.transactions.length === 1 ? '' : 's'} in total`}
              action={months.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-600">
                    {[['range', CalendarRange, 'Date range (up to 1 month)'], ['month', CalendarDays, 'By month']].map(([mode, Icon, label]) => (
                      <button
                        key={mode}
                        onClick={() => setFilterMode(mode)}
                        title={label}
                        aria-label={label}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${filterMode === mode ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
                      >
                        <Icon size={14} /> <span className="hidden sm:inline">{mode === 'range' ? 'Range' : 'Month'}</span>
                      </button>
                    ))}
                  </div>
                  {filterMode === 'range' ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <input
                        type="date"
                        value={range.from}
                        max={range.to}
                        onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      –
                      <input
                        type="date"
                        value={range.to}
                        min={range.from}
                        max={oneMonthAfter(range.from)}
                        onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  ) : (
                  <div className="flex items-center gap-1">
                  {/* Older is to the left, like a calendar. */}
                  <button
                    onClick={() => setMonth(months[monthIndex + 1]?.[0])}
                    disabled={monthIndex >= months.length - 1}
                    title="Previous month with trades"
                    className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <select
                    value={shownMonth || ''}
                    onChange={(e) => setMonth(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    {months.map(([key]) => (
                      <option key={key} value={key} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">{monthLabel(key)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setMonth(months[monthIndex - 1]?.[0])}
                    disabled={monthIndex <= 0}
                    title="Next month with trades"
                    className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    <ChevronRight size={16} />
                  </button>
                  </div>
                  )}
                </div>
              )}
            />
            {filterMode === 'range' && rangeError && <p className="-mt-2 mb-3 text-xs font-medium text-red-600 dark:text-red-400">{rangeError}</p>}
            {shownTransactions.length > 0 && (
              <p className="-mt-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
                {periodLabel}: {shownTransactions.length} trade{shownTransactions.length === 1 ? '' : 's'}
                {monthBought > 0 && <> · bought {formatCurrency(monthBought, currency)}</>}
                {monthSold > 0 && <> · sold {formatCurrency(monthSold, currency)}</>}
              </p>
            )}
            {holding.transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">No buy/sell transactions recorded for this holding.</p>
            ) : shownTransactions.length === 0 ? (
              !rangeError && (
                <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  No trades {filterMode === 'range' ? `between ${periodLabel}` : `in ${periodLabel}`}.{' '}
                  {filterMode === 'range' && <button onClick={() => setFilterMode('month')} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Browse by month</button>}
                </p>
              )
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3 text-right">Qty</th>
                      <th className="px-5 py-3 text-right">Price</th>
                      <th className="px-5 py-3 text-right">Fee</th>
                      <th className="px-5 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownTransactions.map((t) => {
                      const isBuy = t.type === 'buy'
                      return (
                        <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60">
                          <td className="whitespace-nowrap px-5 py-3 text-gray-600 dark:text-gray-400">
                            {new Date(t.occurredAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isBuy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isBuy ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                              {isBuy ? 'Buy' : 'Sell'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right text-gray-900 dark:text-gray-100">{formatQuantity(t.quantity)}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right text-gray-600 dark:text-gray-400">{formatCurrency(t.pricePerUnit, currency)}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right text-gray-600 dark:text-gray-400" title={t.fee === null ? 'Fee unknown — no market price was entered for this trade' : undefined}>{t.fee === null ? '' : formatCurrency(t.fee, currency)}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(t.totalAmount, currency)}
                            {t.realizedGain !== null && (
                              <span className={`block text-xs ${gainClass(t.realizedGain)}`}>{signed(t.realizedGain, currency)}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
