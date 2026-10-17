'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Wallet, Scale, ScrollText, AlertTriangle, ChevronLeft, ChevronRight, CalendarRange, CalendarDays } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatQuantity } from '@/lib/format'
import CardHeader from '@/components/CardHeader'
import SummaryCard from '@/components/SummaryCard'

const ACCOUNT_TYPE_LABELS = { bank: 'Bank', e_wallet: 'E-Wallet', cash: 'Cash', credit_card: 'Credit Card' }

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// The latest end allowed for a range starting on `from`: one calendar month on.
const oneMonthAfter = (from) => {
  const d = new Date(`${from}T00:00:00`)
  return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()))
}
const defaultRange = () => {
  const today = new Date()
  return { from: dayKey(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())), to: dayKey(today) }
}
// First and last day of a 'YYYY-MM' month.
const monthBounds = (key) => {
  const [year, month] = key.split('-').map(Number)
  return { from: `${key}-01`, to: dayKey(new Date(year, month, 0)) }
}
const shortDate = (key) => new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

// One readable line per movement — what a bank statement would print.
function describeEntry(entry) {
  switch (entry.source) {
    case 'transfer_out':
      return { title: `Transfer to ${entry.counterparty}${entry.isReversal ? ' (reversal)' : ''}`, detail: entry.description, kind: 'Transfer' }
    case 'transfer_in':
      return { title: `Transfer from ${entry.counterparty}${entry.isReversal ? ' (reversal)' : ''}`, detail: entry.description, kind: 'Transfer' }
    case 'investment_buy':
      return { title: `Buy ${entry.description}`, detail: `${formatQuantity(entry.quantity)} unit`, kind: 'Investment' }
    case 'investment_sell':
      return { title: `Sell ${entry.description}`, detail: `${formatQuantity(entry.quantity)} unit`, kind: 'Investment' }
    case 'adjustment':
      return { title: 'Balance correction', detail: null, kind: 'Adjustment' }
    default:
      return {
        title: entry.description || entry.categoryName || (entry.amount > 0 ? 'Income' : 'Expense'),
        detail: entry.description ? entry.categoryName : null,
        kind: entry.amount > 0 ? 'Income' : 'Expense'
      }
  }
}

function formatDateTime(value) {
  const d = new Date(value)
  return {
    date: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
}

export default function AccountStatementPage() {
  const { id } = useParams()
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Same two ways to pick a stretch as a holding's trades: a date range of up
  // to one month (the last month by default), or a calendar month that has
  // movements, for going further back.
  const [filterMode, setFilterMode] = useState('range')
  const [range, setRange] = useState(defaultRange)
  const [month, setMonth] = useState(null)
  const months = statement?.months || []
  const shownMonth = month && months.includes(month) ? month : months[0] || null
  const monthIndex = months.indexOf(shownMonth)
  const rangeError = range.from > range.to
    ? 'The start date is after the end date.'
    : range.to > oneMonthAfter(range.from) ? 'Pick a range of up to one month.' : ''
  const period = filterMode === 'month'
    ? (shownMonth ? monthBounds(shownMonth) : null)
    : (rangeError ? null : range)
  const periodLabel = filterMode === 'month' ? (shownMonth ? monthLabel(shownMonth) : '') : `${shortDate(range.from)} – ${shortDate(range.to)}`

  useEffect(() => {
    async function load() {
      if (!period) return
      setError('')
      setLoading(true)
      try {
        const params = new URLSearchParams({ startDate: period.from, endDate: period.to })
        setStatement(await request(`/accounts/${id}/statement?${params.toString()}`))
      } catch (err) {
        setError(err.message || 'Failed to load the account statement')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, period?.from, period?.to])

  const account = statement?.account
  const currency = account?.currency
  const inputClass = 'rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

  return (
    <div className="space-y-6">
      <div>
        <Link href="/accounts" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400">
          <ArrowLeft size={14} /> Accounts
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{account ? account.name : 'Account statement'}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {account ? `${ACCOUNT_TYPE_LABELS[account.type] || account.type} · ${account.currency}${account.isArchived ? ' · Archived' : ''} · Account statement` : 'Every movement in and out of this account'}
            </p>
          </div>
          {account && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Current balance <span className="ml-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(account.balance, currency)}</span>
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
        <CardHeader
          icon={ScrollText}
          color="slate"
          title="Period"
          subtitle={periodLabel}
          action={
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
                  <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className={inputClass} />
                  –
                  <input type="date" value={range.to} min={range.from} max={oneMonthAfter(range.from)} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className={inputClass} />
                </div>
              ) : months.length === 0 ? (
                <span className="text-xs text-gray-400 dark:text-gray-500">No movements yet</span>
              ) : (
                <div className="flex items-center gap-1">
                  {/* Older is to the left, like a calendar. */}
                  <button
                    onClick={() => setMonth(months[monthIndex + 1])}
                    disabled={monthIndex >= months.length - 1}
                    title="Previous month with movements"
                    className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <select value={shownMonth || ''} onChange={(e) => setMonth(e.target.value)} className={inputClass}>
                    {months.map((key) => (
                      <option key={key} value={key} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">{monthLabel(key)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setMonth(months[monthIndex - 1])}
                    disabled={monthIndex <= 0}
                    title="Next month with movements"
                    className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          }
        />
        {filterMode === 'range' && rangeError && <p className="text-xs font-medium text-red-600 dark:text-red-400">{rangeError}</p>}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {statement && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard icon={Wallet} color="slate" label="Opening balance" value={formatCurrency(statement.openingBalance, currency)} />
          <SummaryCard icon={ArrowDownLeft} color="emerald" label="Money in" value={formatCurrency(statement.totalIn, currency)} />
          <SummaryCard icon={ArrowUpRight} color="red" label="Money out" value={formatCurrency(statement.totalOut, currency)} />
          <SummaryCard icon={Scale} color="blue" label="Closing balance" value={formatCurrency(statement.closingBalance, currency)} />
        </div>
      )}

      {statement && !statement.consistent && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Some older balance changes aren&apos;t in this account&apos;s history, so the earliest running balances may not match what you saw at the time. Recent balances are accurate.
        </p>
      )}

      <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
        <CardHeader icon={ScrollText} color="violet" title="Movements" subtitle={statement ? `${statement.entries.length} in this period` : null} />
        {loading && !statement ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading statement...</p>
        ) : !statement ? null : statement.entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            No movements {filterMode === 'range' ? `between ${periodLabel}` : `in ${periodLabel}`}.{' '}
            {filterMode === 'range' && months.length > 0 && <button onClick={() => setFilterMode('month')} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Browse by month</button>}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3 text-right">In</th>
                  <th className="px-5 py-3 text-right">Out</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3 italic">Opening balance</td>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3" />
                  <td className="whitespace-nowrap px-5 py-3 text-right">{formatCurrency(statement.openingBalance, currency)}</td>
                </tr>
                {statement.entries.map((entry) => {
                  const { title, detail, kind } = describeEntry(entry)
                  const { date, time } = formatDateTime(entry.occurredAt)
                  return (
                    <tr key={`${entry.source}-${entry.id}`} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60">
                      <td className="whitespace-nowrap px-5 py-3 text-gray-600 dark:text-gray-400">
                        {date}
                        <span className="block text-xs text-gray-400 dark:text-gray-500">{time}</span>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{[kind, detail].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {entry.amount > 0 ? formatCurrency(entry.amount, currency) : ''}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-red-600 dark:text-red-400">
                        {entry.amount < 0 ? formatCurrency(-entry.amount, currency) : ''}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-gray-900 dark:text-gray-100">{formatCurrency(entry.balanceAfter, currency)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 dark:border-gray-600 font-semibold text-gray-900 dark:text-gray-100">
                <tr>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3">Total</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(statement.totalIn, currency)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-red-600 dark:text-red-400">{formatCurrency(statement.totalOut, currency)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">{formatCurrency(statement.closingBalance, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
