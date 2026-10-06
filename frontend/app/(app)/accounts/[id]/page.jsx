'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Wallet, Scale, ScrollText, AlertTriangle } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatQuantity } from '@/lib/format'
import CardHeader from '@/components/CardHeader'
import SummaryCard from '@/components/SummaryCard'

const ACCOUNT_TYPE_LABELS = { bank: 'Bank', e_wallet: 'E-Wallet', cash: 'Cash', credit_card: 'Credit Card' }

// Local date parts, not toISOString() (UTC), so "today" is the user's today.
function toDateInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function lastDaysRange(days) {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1))
  return { startDate: toDateInputValue(start), endDate: toDateInputValue(end) }
}

const ALL_TIME = { startDate: '', endDate: '' }

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
  const [range, setRange] = useState(() => lastDaysRange(30))
  const [activeQuickRange, setActiveQuickRange] = useState(30)
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(nextRange) {
    setError('')
    if (nextRange.startDate && nextRange.endDate && nextRange.startDate > nextRange.endDate) {
      setError('End date must be after start date.')
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (nextRange.startDate) params.set('startDate', nextRange.startDate)
      if (nextRange.endDate) params.set('endDate', nextRange.endDate)
      setStatement(await request(`/accounts/${id}/statement?${params.toString()}`))
    } catch (err) {
      setError(err.message || 'Failed to load the account statement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    function init() {
      load(lastDaysRange(30))
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function applyQuickRange(days) {
    const next = days ? lastDaysRange(days) : ALL_TIME
    setRange(next)
    setActiveQuickRange(days)
    load(next)
  }

  const account = statement?.account
  const currency = account?.currency

  const quickButton = (days, label) => (
    <button
      onClick={() => applyQuickRange(days)}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${activeQuickRange === days ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
    >
      {label}
    </button>
  )

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
          action={
            <div className="flex gap-1 rounded-full bg-gray-100 dark:bg-gray-700 p-1">
              {quickButton(7, '7 Days')}
              {quickButton(30, '30 Days')}
              {quickButton(null, 'All')}
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="date"
            value={range.startDate}
            onChange={(e) => { setRange({ ...range, startDate: e.target.value }); setActiveQuickRange(undefined) }}
            className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={range.endDate}
            onChange={(e) => { setRange({ ...range, endDate: e.target.value }); setActiveQuickRange(undefined) }}
            className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
          />
          <button onClick={() => load(range)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md">
            Show
          </button>
        </div>
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
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading statement...</p>
        ) : !statement ? null : statement.entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No movements in this period.</p>
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
