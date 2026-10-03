'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Landmark, HeartPulse, Receipt, Target, LineChart as LineChartIcon, PieChart as PieIcon, ArrowRightLeft, RefreshCw } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format'
import SummaryCard from '@/components/SummaryCard'
import HealthGauge from '@/components/HealthGauge'
import CardHeader from '@/components/CardHeader'

const ALLOCATION_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

// Recharts' Tooltip takes literal colors via contentStyle, not Tailwind
// classes — these CSS variables (defined in globals.css) are the dark-mode
// bridge for it, same idea as the chart grid/track colors elsewhere.
const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--tooltip-text)'
}
const ACCOUNT_TYPE_LABELS = { bank: 'Bank', e_wallet: 'E-Wallet', cash: 'Cash', credit_card: 'Credit Card', investments: 'Investments' }

export default function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [trends, setTrends] = useState(null)
  const [allocation, setAllocation] = useState(null)
  const [upcomingBills, setUpcomingBills] = useState(null)
  const [billsTotal, setBillsTotal] = useState(null)
  const [goals, setGoals] = useState(null)
  const [exchangeRates, setExchangeRates] = useState(null)
  const [refreshingRates, setRefreshingRates] = useState(false)
  const [rateRefreshError, setRateRefreshError] = useState('')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [hideAmounts, setHideAmounts] = useState(false)
  const [payError, setPayError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [summaryData, trendsData, allocationData, billsData, goalsData, ratesData] = await Promise.all([
          request(`/reports/dashboard?periodOffset=${periodOffset}`),
          request('/reports/trends?months=6'),
          request('/reports/asset-allocation'),
          request('/bills/upcoming'),
          request('/goals'),
          request('/accounts/exchange-rates')
        ])
        setSummary(summaryData)
        setTrends(trendsData.trends)
        setAllocation(allocationData)
        setUpcomingBills(billsData.bills)
        setBillsTotal({ total: billsData.total, displayCurrency: billsData.displayCurrency })
        setGoals(goalsData.goals)
        setExchangeRates(ratesData)
      } catch (err) {
        setError(err.message || 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [periodOffset])

  async function handlePayBill(bill) {
    setPayError('')
    const confirmed = window.confirm(
      `Mark "${bill.name}" as paid?\n\nThis will record a ${formatCurrency(bill.amount, summary?.displayCurrency)} expense and deduct it from the linked account. This can't be undone from here.`
    )
    if (!confirmed) return
    try {
      await request(`/bills/${bill.id}/pay`, { method: 'POST' })
      const billsData = await request('/bills/upcoming')
      setUpcomingBills(billsData.bills)
      setBillsTotal({ total: billsData.total, displayCurrency: billsData.displayCurrency })
    } catch (err) {
      setPayError(err.message || 'Failed to mark bill as paid')
    }
  }

  async function handleRefreshRates() {
    setRefreshingRates(true)
    setRateRefreshError('')
    try {
      const data = await request('/accounts/exchange-rates/refresh', { method: 'POST' })
      setExchangeRates(data)
    } catch (err) {
      setRateRefreshError(err.message || 'Failed to refresh exchange rates')
    } finally {
      setRefreshingRates(false)
    }
  }

  if (loading) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading dashboard...</p>

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-700 dark:text-red-400">
        Could not load your dashboard: {error}
      </div>
    )
  }

  const hasTrendData = trends && trends.some((t) => t.income > 0 || t.expense > 0)
  const currency = summary?.displayCurrency || 'IDR'
  const periodLabel = summary?.periodLabel || ''
  const changes = summary?.changes

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Here&apos;s a summary of your finances.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exchangeRates && exchangeRates.rates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                {exchangeRates.rates.map((r) => (
                  <div
                    key={r.currency}
                    title={r.asOf ? `Last updated ${new Date(r.asOf).toLocaleString()}` : undefined}
                    className="flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 px-2.5 py-1"
                  >
                    <ArrowRightLeft size={11} className="shrink-0 text-gray-400 dark:text-gray-500" />
                    <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                      1 {r.currency} = {r.rateToDisplay !== null ? formatCurrency(r.rateToDisplay, exchangeRates.displayCurrency) : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleRefreshRates}
                disabled={refreshingRates}
                title="Refresh exchange rates now"
                className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
              >
                <RefreshCw size={13} className={refreshingRates ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
          <div className="flex gap-1 rounded-full bg-gray-100 dark:bg-gray-700 p-1">
          <button
            onClick={() => setPeriodOffset(1)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${periodOffset === 1 ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            Last Month
          </button>
          <button
            onClick={() => setPeriodOffset(0)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${periodOffset === 0 ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          >
            This Month
          </button>
          </div>
        </div>
      </div>

      {rateRefreshError && <p className="text-sm text-red-600 dark:text-red-400">{rateRefreshError}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <SummaryCard
          icon={Wallet}
          color="blue"
          label="Total Balance"
          value={formatCurrency(summary.totalBalance, currency)}
          maskable
          hidden={hideAmounts}
          onToggleHidden={() => setHideAmounts((v) => !v)}
        />
        <SummaryCard icon={TrendingUp} color="emerald" label="Income" value={formatCurrency(summary.income, currency)} hint={periodLabel} change={changes?.income} />
        <SummaryCard icon={TrendingDown} color="red" label="Expense" value={formatCurrency(summary.expense, currency)} hint={periodLabel} change={changes?.expense} />
        <SummaryCard icon={PiggyBank} color="amber" label="Savings Rate" value={formatPercent(summary.savingsRate)} hint={periodLabel} change={changes?.savingsRate} />
        <SummaryCard
          icon={Landmark}
          color="violet"
          label="Net Worth"
          value={formatCurrency(summary.netWorth, currency)}
          change={changes?.netWorth}
          maskable
          hidden={hideAmounts}
          onToggleHidden={() => setHideAmounts((v) => !v)}
        />
        <SummaryCard icon={HeartPulse} color="slate" label="Financial Health">
          <div className="mt-1.5 flex justify-center">
            <HealthGauge score={summary.financialHealthScore} size={48} strokeWidth={5} />
          </div>
        </SummaryCard>
      </div>

      {summary.hasUnconverted && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Some amounts couldn&apos;t be converted to {currency} because we don&apos;t have today&apos;s exchange rate for that currency yet.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader icon={TrendingUp} color="emerald" title="Cash Flow (last 6 months)" />
          {hasTrendData ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={formatNumber} width={130} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => formatCurrency(value, currency)} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" fill="#10b981" name="Income" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState />
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader icon={LineChartIcon} color="blue" title="Monthly Trend" />
          {hasTrendData ? (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={formatNumber} width={130} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => formatCurrency(value, currency)} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="net" stroke="#2563eb" name="Net" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader
            icon={Receipt}
            color="red"
            title="Upcoming Bills"
            action={<Link href="/bills" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">See all</Link>}
          />
          {billsTotal && upcomingBills && upcomingBills.length > 0 && (
            <p className="-mt-2 mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(billsTotal.total, billsTotal.displayCurrency)}
              <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">total due</span>
            </p>
          )}
          {payError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{payError}</p>}
          {upcomingBills && upcomingBills.length > 0 ? (
            <ul className="space-y-3">
              {upcomingBills.slice(0, 2).map((bill) => (
                <li key={bill.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500">
                      <Receipt size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{bill.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(bill.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        {bill.isOverdue && (
                          <span className="rounded-full bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Overdue</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatCurrency(bill.amount, currency)}</span>
                    <button
                      onClick={() => handlePayBill(bill)}
                      className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"
                    >
                      Pay
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChartState label="No bills due soon" compact />
          )}
          {upcomingBills && upcomingBills.length > 2 && (
            <Link href="/bills" className="mt-2 block text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400">
              +{upcomingBills.length - 2} more due soon
            </Link>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader
            icon={Target}
            color="violet"
            title="Goal Progress"
            action={<Link href="/goals" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">See all</Link>}
          />
          {goals && goals.length > 0 ? (
            <ul className="space-y-4">
              {goals.slice(0, 2).map((goal) => (
                <li key={goal.id}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{goal.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${goal.isComplete ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>
                      {goal.progressPercentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <div
                      className={`h-full rounded-full ${goal.isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(100, goal.progressPercentage)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {formatCurrency(goal.saved_amount, currency)} / {formatCurrency(goal.target_amount, currency)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChartState label="No savings goals yet" compact />
          )}
          {goals && goals.length > 2 && (
            <Link href="/goals" className="mt-2 block text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400">
              +{goals.length - 2} more goals
            </Link>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader icon={PieIcon} color="amber" title="Asset Allocation" />
          {allocation && allocation.allocation.length > 0 ? (
            <div className="flex items-center gap-3">
              <div className="h-24 w-24 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocation.allocation}
                      dataKey="amount"
                      nameKey="type"
                      innerRadius={28}
                      outerRadius={45}
                      paddingAngle={3}
                      cornerRadius={3}
                    >
                      {allocation.allocation.map((entry, index) => (
                        <Cell key={entry.type} fill={ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => formatCurrency(value, allocation.displayCurrency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {allocation.allocation.map((entry, index) => (
                  <li key={entry.type} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-gray-600 dark:text-gray-400">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] }} />
                      <span className="truncate">{ACCOUNT_TYPE_LABELS[entry.type] || entry.type}</span>
                    </span>
                    <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{entry.percentage}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyChartState label="No active accounts yet" />
          )}
        </div>
      </div>

    </div>
  )
}

function EmptyChartState({ label = 'No transaction data yet', compact = false }) {
  return (
    <div className={`flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 ${compact ? 'h-24' : 'h-64'}`}>
      {label}
    </div>
  )
}
