'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Landmark, HeartPulse, Receipt, Target, PieChart as PieIcon, ArrowRightLeft, RefreshCw, ShoppingBag } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatCompact, formatPercent } from '@/lib/format'
import SummaryCard from '@/components/SummaryCard'
import HealthGauge from '@/components/HealthGauge'
import CardHeader from '@/components/CardHeader'
import ScrollFadeList from '@/components/ScrollFadeList'
import ScrollFadeBox from '@/components/ScrollFadeBox'
import ConfirmDialog from '@/components/ConfirmDialog'
import SpendingPaceCard from '@/components/SpendingPaceCard'
import { todayInputValue } from '@/lib/dates'
import { getHideAmountsDefault } from '@/lib/preferences'
import { withDistinctColors, useChartTheme } from '@/lib/chartColors'


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
  const [cycleTrend, setCycleTrend] = useState(null)
  const [previousTrend, setPreviousTrend] = useState(null)
  const [budgetTrend, setBudgetTrend] = useState(null)
  const [breakdown, setBreakdown] = useState(null)
  const chartTheme = useChartTheme()
  const [upcomingBills, setUpcomingBills] = useState(null)
  const [billsTotal, setBillsTotal] = useState(null)
  const [goals, setGoals] = useState(null)
  const [exchangeRates, setExchangeRates] = useState(null)
  const [refreshingRates, setRefreshingRates] = useState(false)
  const [rateRefreshError, setRateRefreshError] = useState('')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [hideAmounts, setHideAmounts] = useState(false)
  const [payError, setPayError] = useState('')
  const [payingBill, setPayingBill] = useState(null)
  const [payDate, setPayDate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Balance cards start hidden when that is the saved preference (Settings).
  useEffect(() => {
    function init() {
      setHideAmounts(getHideAmountsDefault())
    }
    init()
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [summaryData, trendsData, allocationData, cycleTrendData, previousTrendData, budgetTrendData, breakdownData, billsData, goalsData, ratesData] = await Promise.all([
          request(`/reports/dashboard?periodOffset=${periodOffset}`),
          request('/reports/trends?months=6'),
          request(`/reports/asset-allocation?periodOffset=${periodOffset}`),
          request(`/reports/cycle-trend?periodOffset=${periodOffset}`),
          request(`/reports/cycle-trend?periodOffset=${periodOffset + 1}`),
          request(`/reports/cycle-trend?periodOffset=${periodOffset}&budgeted=1`),
          request(`/reports/expense-breakdown?periodOffset=${periodOffset}`),
          request('/bills/upcoming'),
          request('/goals'),
          request('/accounts/exchange-rates')
        ])
        setSummary(summaryData)
        setTrends(trendsData.trends)
        setAllocation(allocationData)
        setCycleTrend(cycleTrendData)
        setPreviousTrend(previousTrendData)
        setBudgetTrend(budgetTrendData)
        setBreakdown(breakdownData)
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

  function handlePayBill(bill) {
    setPayError('')
    setPayingBill(bill)
    setPayDate(todayInputValue())
  }

  async function confirmPayBill() {
    const bill = payingBill
    setPayingBill(null)
    try {
      await request(`/bills/${bill.id}/pay`, { method: 'POST', body: JSON.stringify({ paidOn: payDate || undefined }) })
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
  const allocationSlices = allocation
    ? withDistinctColors([...allocation.allocation].sort((a, b) => b.amount - a.amount), { nameKey: 'type', theme: chartTheme })
    : []
  const expenseSlices = breakdown
    ? withDistinctColors([...breakdown.breakdown].sort((a, b) => b.amount - a.amount), { nameKey: 'categoryName', theme: chartTheme })
    : []

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
        <SummaryCard icon={PiggyBank} color="amber" label="Savings Rate" value={formatPercent(summary.savingsRate)} hint={periodLabel} change={changes?.savingsRate} changeUnit=" pts" />
        <SummaryCard
          icon={Landmark}
          color="violet"
          label="Net Worth"
          value={formatCurrency(summary.netWorth, currency)}
          hint="this cycle"
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 flex flex-col lg:col-span-2">
          <CardHeader icon={TrendingUp} color="emerald" title="Cash Flow (last 6 months)" />
          {hasTrendData ? (
            <div className="min-h-[210px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={formatCompact} width={56} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => formatCurrency(value, currency)} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" fill="#10b981" name="Income" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState />
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader
            icon={ShoppingBag}
            color="red"
            title="Expense Breakdown"
            subtitle={breakdown && breakdown.total > 0 ? `${formatCurrency(breakdown.total, breakdown.displayCurrency)} spent` : ''}
          />
          {expenseSlices.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-32 w-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenseSlices} dataKey="amount" nameKey="categoryName" innerRadius={36} outerRadius={60} paddingAngle={2} cornerRadius={3}>
                      {expenseSlices.map((entry) => (
                        <Cell key={entry.categoryName} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => formatCurrency(value, breakdown.displayCurrency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ScrollFadeList className="h-40 w-full min-w-0 space-y-1 pr-1">
                {expenseSlices.map((entry) => (
                  <li key={entry.categoryName} title={formatCurrency(entry.amount, breakdown.displayCurrency)} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{entry.categoryName}</span>
                    </span>
                    <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{entry.percentage}%</span>
                  </li>
                ))}
              </ScrollFadeList>
            </div>
          ) : (
            <EmptyChartState label="No spending this cycle yet" />
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader
            icon={PieIcon}
            color="amber"
            title="Asset Allocation"
            subtitle={allocation?.asOf
              ? `As of ${new Date(`${allocation.asOf}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'Now'}
          />
          {allocation && allocation.allocation.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-32 w-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationSlices}
                      dataKey="amount"
                      nameKey="type"
                      innerRadius={36}
                      outerRadius={60}
                      paddingAngle={2}
                      cornerRadius={3}
                    >
                      {allocationSlices.map((entry) => (
                        <Cell key={entry.type} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => formatCurrency(value, allocation.displayCurrency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ScrollFadeList className="h-40 w-full min-w-0 space-y-1 pr-1">
                {allocationSlices.map((entry) => (
                  <li key={entry.type} title={formatCurrency(entry.amount, allocation.displayCurrency)} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{ACCOUNT_TYPE_LABELS[entry.type] || entry.type}</span>
                    </span>
                    <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{entry.percentage}%</span>
                  </li>
                ))}
              </ScrollFadeList>
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Add your bank accounts, e-wallets and cash to see how your money is spread.</p>
              <Link href="/accounts" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Add an account</Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SpendingPaceCard current={cycleTrend} previous={previousTrend} budgeted={budgetTrend} currency={currency} className="lg:col-span-2 lg:h-[300px]" />

        <div className="flex flex-col rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 lg:h-[300px]">
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
          <ScrollFadeBox className="pr-1">
          {upcomingBills && upcomingBills.length > 0 ? (
            <ul className="space-y-3">
              {upcomingBills.map((bill) => (
                <li key={bill.id} className="flex gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500">
                    <Receipt size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-medium text-gray-900 dark:text-gray-100">{bill.name}</p>
                      <span className="shrink-0 text-sm font-medium text-gray-900 dark:text-gray-100">{formatCurrency(bill.amount, bill.currency || currency)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(bill.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        {bill.isOverdue && (
                          <span className="rounded-full bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Overdue</span>
                        )}
                      </div>
                      <button
                        onClick={() => handlePayBill(bill)}
                        className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-3 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"
                      >
                        Pay
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChartState label="No bills due soon" compact />
          )}
          </ScrollFadeBox>
        </div>

        <div className="flex flex-col rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 lg:h-[300px]">
          <CardHeader
            icon={Target}
            color="violet"
            title="Goal Progress"
            action={<Link href="/goals" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">See all</Link>}
          />
          <ScrollFadeBox className="pr-1">
          {goals && goals.length > 0 ? (
            <ul className="space-y-4">
              {goals.map((goal) => (
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
                    {formatCurrency(goal.saved_amount, goal.currency)} / {formatCurrency(goal.target_amount, goal.currency)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyChartState label="No savings goals yet" compact />
          )}
          </ScrollFadeBox>
        </div>
      </div>

      <ConfirmDialog
        open={!!payingBill}
        title={payingBill ? `Mark "${payingBill.name}" as paid?` : ''}
        message={payingBill && `This will record a ${formatCurrency(payingBill.amount, payingBill.currency || summary?.displayCurrency)} expense and deduct it from the linked account. This can't be undone from here.`}
        confirmLabel="Mark as paid"
        danger={false}
        onConfirm={confirmPayBill}
        onCancel={() => setPayingBill(null)}
      >
        <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
          Paid on
          <input
            type="date"
            value={payDate}
            max={todayInputValue()}
            onChange={(e) => setPayDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm normal-case"
          />
        </label>
      </ConfirmDialog>
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
