'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Layers, Wallet, TrendingUp, Receipt, History, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, CalendarRange, CalendarDays, Tag, Calculator, Zap, AlertTriangle, Minus } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatQuantity } from '@/lib/format'
import PriceHistoryChart from '@/components/PriceHistoryChart'
import SellHoldingModal from '@/components/SellHoldingModal'
import CardHeader from '@/components/CardHeader'

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

// "Today 17:02", "Yesterday 17:00" or "12 Oct, 17:00".
function formatUpdatedAt(value) {
  const d = new Date(value)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return `Today ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`
}

const SOURCE_LABELS = { yahoo: 'Yahoo Finance', indodax: 'Indodax' }

export default function HoldingDetailPage() {
  const { id } = useParams()
  const [holding, setHolding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [priceHistory, setPriceHistory] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [selling, setSelling] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    async function load() {
      request(`/investments/${id}/price-history`).then(setPriceHistory).catch(() => setPriceHistory({ points: [] }))
      request('/accounts').then((d) => setAccounts(d.accounts)).catch(() => {})
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
  }, [id, reloadKey])

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
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{holding ? holding.assetName : 'Holding'}</h1>
          {holding && [...new Set([ASSET_TYPE_LABELS[holding.assetType] || holding.assetType, holding.category, holding.currency].filter(Boolean))].map((chip) => (
            <span key={chip} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">{chip}</span>
          ))}
          {holding?.isClosed && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Closed</span>}
          {holding && holding.quantity > 0 && (
            <button onClick={() => setSelling(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-red-700">
              <Minus size={15} strokeWidth={2.5} /> Sell
            </button>
          )}
        </div>
        {selling && holding && (
          <SellHoldingModal
            holding={{ id: holding.id, name: holding.assetName, currency: holding.currency, quantity: holding.quantity, currentPrice: holding.currentPrice, costBasisTotal: holding.costBasis }}
            accounts={accounts}
            onClose={() => setSelling(false)}
            onSold={() => { setSelling(false); setReloadKey((k) => k + 1) }}
          />
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>}

      {holding && (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
            <div className={`h-1 ${holding.unrealizedGainExcludingFees >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[1fr_20rem]">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Market value</p>
                <p className="mt-1 truncate text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{formatCurrency(holding.value, currency)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${holding.unrealizedGainExcludingFees >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {holding.unrealizedGainExcludingFees >= 0 ? <ArrowUpRight size={15} strokeWidth={2.5} /> : <ArrowDownRight size={15} strokeWidth={2.5} />}
                    {holding.unrealizedGainExcludingFees >= 0 ? '+' : '−'}{formatCurrency(Math.abs(holding.unrealizedGainExcludingFees), currency)}
                    {holding.returnPercentageExcludingFees !== null && <span className="font-medium opacity-80">· {holding.returnPercentageExcludingFees >= 0 ? '+' : '−'}{Math.abs(holding.returnPercentageExcludingFees)}%</span>}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500" title="Without broker fees. The version with fees is in the Cost basis table below">Unrealized P&amp;L</span>
                </div>
                <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {holding.priceError ? (
                    <><AlertTriangle size={13} className="text-amber-500" /> Price not updated: {holding.priceError}</>
                  ) : holding.priceSource ? (
                    <><Zap size={13} className="text-emerald-500" /> Auto price · {holding.priceSymbol} on {SOURCE_LABELS[holding.priceSource] || holding.priceSource}{holding.priceUpdatedAt && <> · {formatUpdatedAt(holding.priceUpdatedAt)}</>}</>
                  ) : (
                    <>Price entered manually</>
                  )}
                </p>
              </div>
              <div className="flex flex-col justify-center gap-3 border-t border-gray-100 pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0 dark:border-gray-700">
                {[
                  [Layers, 'Quantity', formatQuantity(holding.quantity)],
                  [Tag, 'Last price', formatCurrency(holding.currentPrice, currency)],
                  [Calculator, 'Average price', holding.averagePriceExcludingFees === null ? '-' : formatCurrency(holding.averagePriceExcludingFees, currency)],
                  [Receipt, 'Fees paid', formatCurrency(holding.feesTotal, currency)]
                ].map(([Icon, label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"><Icon size={14} className="text-gray-400 dark:text-gray-500" /> {label}</span>
                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <CardHeader icon={TrendingUp} color="blue" title="Price history" subtitle={`Price per unit against what you paid${holding.priceSymbol ? ` · ${holding.priceSymbol}` : ''}`} />
            {priceHistory === null ? (
              <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Loading prices…</p>
            ) : (
              <PriceHistoryChart
                points={priceHistory.points}
                currency={priceHistory.currency || currency}
                averagePrice={holding.averagePriceExcludingFees}
                trades={holding.transactions}
                source={priceHistory.source}
              />
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <CardHeader icon={Wallet} color="violet" title="Cost basis" subtitle="Without fees matches most broker apps; with fees is what actually left your account" />
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3"></th>
                    <th className="px-5 py-3 text-right">Without fees</th>
                    <th className="px-5 py-3 text-right">With fees</th>
                  </tr>
                </thead>
                <tbody className="text-gray-900 dark:text-gray-100">
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Cost basis</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium">{formatCurrency(holding.costBasisExcludingFees, currency)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">{formatCurrency(holding.costBasis, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Average price</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium">{holding.averagePriceExcludingFees === null ? '-' : formatCurrency(holding.averagePriceExcludingFees, currency)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">{holding.averagePrice === null ? '-' : formatCurrency(holding.averagePrice, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Unrealized P/L</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-medium ${gainClass(holding.unrealizedGainExcludingFees)}`}>{signed(holding.unrealizedGainExcludingFees, currency)}</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right ${gainClass(holding.unrealizedGain)}`}>{signed(holding.unrealizedGain, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Return</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-medium ${gainClass(holding.returnPercentageExcludingFees)}`}>{holding.returnPercentageExcludingFees === null ? '-' : `${holding.returnPercentageExcludingFees >= 0 ? '+' : ''}${holding.returnPercentageExcludingFees}%`}</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right ${gainClass(holding.returnPercentage)}`}>{holding.returnPercentage === null ? '-' : `${holding.returnPercentage >= 0 ? '+' : ''}${holding.returnPercentage}%`}</td>
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
                              <span title="Profit or loss on this sale, after fees and tax" className={`block text-xs ${gainClass(t.realizedGain)}`}>{signed(t.realizedGain, currency)}</span>
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
