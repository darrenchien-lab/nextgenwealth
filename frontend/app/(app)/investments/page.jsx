'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts'
import { Pencil, X, Plus, TrendingUp, PieChart, Bitcoin, Package, Landmark, Coins, Building2, Wallet, ArrowUpRight, ArrowDownRight, History, ChevronDown, Layers } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatNumber, formatQuantity } from '@/lib/format'
import { CHART_RANGES, applyChartRange, withTimestamps, timeAxisTicks, timeAxisFormatter, timeTooltipFormatter } from '@/lib/chartRanges'
import TrendAreaChart from '@/components/TrendAreaChart'
import CardHeader from '@/components/CardHeader'
import ConfirmDialog from '@/components/ConfirmDialog'
import SummaryCard from '@/components/SummaryCard'

// Recharts' Tooltip takes literal colors via contentStyle, not Tailwind
// classes — these CSS variables (defined in globals.css) are the dark-mode
// bridge for it, same as the Dashboard/Reports charts.
const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--tooltip-text)'
}

const HOLDING_LINE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#0ea5e9', '#84cc16']

// Fixed colors for specific holdings, falling back to the cycling palette
// above (by index) for anything not named here. Matched by prefix (not
// exact string) because the legend label can have " (category)" appended
// to the raw asset name — e.g. "BTC (Crypto)" — so an exact match against
// "BTC" would silently stop matching the moment a category gets set.
const HOLDING_NAME_COLORS = {
  BTC: '#f97316',
  BBCA: '#2563eb',
  Binance: '#eab308',
  'RDPU Bibit': '#10b981'
}

function getHoldingColor(name, index) {
  const matchedKey = Object.keys(HOLDING_NAME_COLORS).find((key) => name.startsWith(key))
  return matchedKey ? HOLDING_NAME_COLORS[matchedKey] : HOLDING_LINE_COLORS[index % HOLDING_LINE_COLORS.length]
}

const ASSET_TYPES = ['stock', 'mutual_fund', 'crypto', 'etf', 'bond', 'gold', 'property', 'other']
const ASSET_TYPE_LABELS = { stock: 'Stock', mutual_fund: 'Mutual Fund', crypto: 'Crypto', etf: 'ETF', bond: 'Bond', gold: 'Gold', property: 'Property', other: 'Other' }
const ASSET_TYPE_ICONS = { stock: TrendingUp, mutual_fund: PieChart, crypto: Bitcoin, etf: Package, bond: Landmark, gold: Coins, property: Building2, other: Wallet }

// Local date parts, not toISOString() (UTC), so the default is the user's today.
function todayInputValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyForm = () => ({ assetName: '', assetType: '', quantity: '', currency: '', totalSpent: '', price: '', purchasedAt: '', accountId: '', category: '' })

// A purchase is entered as quantity × price per unit, plus — optionally —
// the total actually paid. Whatever the total adds on top of quantity ×
// price is the fee; leaving the total empty means there was no fee.
// Shared by Add Holding and Add Quantity so both work out fees the same way.
function purchaseBreakdown(quantity, price, totalPaid) {
  const qty = Number(quantity)
  const unitPrice = Number(price)
  if (!(qty > 0) || price === '' || !(unitPrice >= 0)) return null
  const gross = qty * unitPrice
  if (totalPaid === '' || totalPaid === undefined) return { gross, total: Math.round(gross * 100) / 100, fee: 0 }
  const total = Number(totalPaid)
  if (Number.isNaN(total)) return null
  return { gross, total, fee: total - gross, tooLow: total < gross - 0.01 }
}

function purchaseError(quantity, price, totalPaid) {
  if (!quantity || !(Number(quantity) > 0)) return 'Please enter a valid quantity.'
  if (price === '' || !(Number(price) >= 0)) return 'Please enter the price per unit.'
  const breakdown = purchaseBreakdown(quantity, price, totalPaid)
  if (!breakdown) return 'Please enter a valid total paid.'
  if (breakdown.tooLow) return 'Total paid can\'t be less than quantity × price — check the numbers.'
  return null
}

// One line spelling out how the total is made up, so a missing or mistyped
// fee is visible before saving.
function PurchaseSummary({ quantity, price, totalPaid, currency, accountName, className }) {
  const b = purchaseBreakdown(quantity, price, totalPaid)
  if (!b) return null
  const money = (value) => formatCurrency(value, currency || undefined)
  return (
    <p className={className}>
      {formatQuantity(quantity)} × {money(Number(price))} = {money(b.gross)}
      {b.tooLow
        ? <span className="text-red-600 dark:text-red-400"> — total paid is less than this</span>
        : b.fee > 0.005
          ? <> + fee {money(b.fee)} = <span className="font-semibold text-gray-900 dark:text-gray-100">{money(b.total)}</span></>
          : <> <span className="text-gray-400 dark:text-gray-500">(no fee)</span></>}
      {accountName && !b.tooLow && <> — deducted from {accountName}</>}
    </p>
  )
}

// Plain-language stand-ins for the backend's literal validation wording,
// caught here before the request goes out (same reasoning as other pages).
const PAYMENT_REQUIRED = 'Select a funding account, or "Other (not tracked in this app)".'
const PAY_SELECT_BASE = 'w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 transition-colors duration-150 dark:bg-gray-800 dark:text-gray-100'
const PAY_SELECT_OK = 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
const PAY_SELECT_MISSING = 'animate-shake border-red-500 ring-2 ring-red-500/30 dark:border-red-400'
// '' = not chosen yet, 'none' = not paid from a tracked account, else an account id.
const paymentAccountId = (value) => (value && value !== 'none' ? Number(value) : undefined)

function validateHoldingForm(f) {
  if (!f.assetName.trim()) return 'Please enter an asset name.'
  if (!f.assetType) return 'Please choose an asset type.'
  if (!f.quantity || !(Number(f.quantity) > 0)) return 'Please enter a valid quantity.'
  if (!f.currency) return 'Please choose a currency.'
  if (!f.accountId) return PAYMENT_REQUIRED
  return purchaseError(f.quantity, f.price, f.totalSpent)
}

const localDateKey = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Hangs each buy/sell on the first chart point on or after its date (a
// 'YYYY-MM' point for monthly-aggregated ranges), so the chart can mark the
// days the invested capital moved and list those trades in the tooltip.
function withTrades(rows, transactions) {
  const tradesByIndex = new Map()
  for (const t of transactions) {
    const dateKey = localDateKey(t.occurred_at)
    const index = rows.findIndex((row) => (row.date.length === 7 ? dateKey.slice(0, 7) <= row.date : dateKey <= row.date))
    if (index < 0) continue
    if (!tradesByIndex.has(index)) tradesByIndex.set(index, [])
    tradesByIndex.get(index).push(`${t.type === 'buy' ? 'Buy' : 'Sell'} ${t.asset_name} ${formatQuantity(t.quantity)}`)
  }
  return rows.map((row, i) => (tradesByIndex.has(i) ? { ...row, trades: tradesByIndex.get(i) } : row))
}

export default function InvestmentsPage() {
  const [portfolio, setPortfolio] = useState(null)
  const [history, setHistory] = useState(null)
  const [historyRange, setHistoryRange] = useState('All')
  // '' = the whole portfolio, otherwise one holding's id.
  const [historyHoldingId, setHistoryHoldingId] = useState('')
  const [holdingsHistory, setHoldingsHistory] = useState(null)
  const [holdingsRange, setHoldingsRange] = useState('All')
  const [transactions, setTransactions] = useState([])
  const [hiddenHoldingKeys, setHiddenHoldingKeys] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [currencies, setCurrencies] = useState([])
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  // Count of saves tried without a payment account (0 = none yet); it also
  // keys the select so the shake replays on every try.
  const [paymentMissing, setPaymentMissing] = useState(0)
  const [addPaymentMissing, setAddPaymentMissing] = useState(0)
  const paymentSelectRef = useRef(null)
  const addPaymentSelectRef = useRef(null)

  const [editingHoldingId, setEditingHoldingId] = useState(null)
  // Same idea as the Accounts page's Transfers card: Transaction History is
  // capped to the Holdings card's live-measured height so it never makes the
  // row taller than the holdings list — older entries scroll inside it, and
  // "View all" opens the full list.
  const holdingsCardRef = useRef(null)
  const [holdingsCardHeight, setHoldingsCardHeight] = useState(null)
  const [showAllTransactions, setShowAllTransactions] = useState(false)

  useEffect(() => {
    const el = holdingsCardRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setHoldingsCardHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [portfolio])

  const [editForm, setEditForm] = useState({ name: '', price: '', purchasedAt: '', addQty: '', addTotalSpent: '', addPrice: '', addAccountId: '', addDate: '', removeQty: '', removeDate: '' })
  const [editError, setEditError] = useState('')
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const filteredHistory = useMemo(() => {
    const rows = applyChartRange(history, historyRange)
    if (!rows) return rows
    // Trades before the range's first day belong to earlier history; one on
    // that first day is marked on it.
    const firstKey = rows[0]?.date
    const shownTrades = transactions.filter((t) => (
      (!historyHoldingId || String(t.holding_id) === historyHoldingId)
      && firstKey && localDateKey(t.occurred_at) >= (firstKey.length === 7 ? `${firstKey}-01` : firstKey)
    ))
    return withTimestamps(withTrades(rows, shownTrades))
  }, [history, historyRange, historyHoldingId, transactions])

  const filteredHoldingsHistory = useMemo(() => {
    const rows = applyChartRange(holdingsHistory?.data, holdingsRange)
    return rows ? withTimestamps(rows) : rows
  }, [holdingsHistory, holdingsRange])

  async function loadPortfolio() {
    setLoading(true)
    try {
      const data = await request('/investments/portfolio')
      setPortfolio(data)
    } catch (err) {
      setLoadError(err.message || 'Failed to load portfolio')
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory(holdingId = historyHoldingId) {
    try {
      const data = await request(`/investments/history${holdingId ? `?holdingId=${holdingId}` : ''}`)
      setHistory(data.history)
    } catch {
      // The trend chart is a bonus view — a failed fetch here shouldn't
      // block the rest of the page from working.
    }
  }

  async function loadHoldingsHistory() {
    try {
      const data = await request('/investments/holdings-history')
      setHoldingsHistory(data)
    } catch {
      // Same reasoning as loadHistory — a bonus chart, not core functionality.
    }
  }

  async function loadTransactions() {
    try {
      const data = await request('/investments/transactions')
      setTransactions(data.transactions)
    } catch {
      // Same reasoning as loadHistory — a bonus view, not core functionality.
    }
  }

  function toggleHoldingLine(key) {
    setHiddenHoldingKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function loadCurrencies() {
    try {
      const data = await request('/accounts/supported-currencies')
      setCurrencies(data.currencies)
    } catch {
      // Fall back to a plain text field's default if this fails to load.
    }
  }

  async function loadAccounts() {
    try {
      const data = await request('/accounts')
      setAccounts(data.accounts)
    } catch {
      // Linking to an account is optional — if this fails, the dropdown
      // just stays empty and the holding can still be added unlinked.
    }
  }

  useEffect(() => {
    function init() {
      loadPortfolio()
      loadHistory()
      loadHoldingsHistory()
      loadTransactions()
      loadCurrencies()
      loadAccounts()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    const validationMessage = validateHoldingForm(form)
    if (validationMessage) {
      setFormError(validationMessage)
      if (!form.accountId) {
        setPaymentMissing((n) => n + 1)
        setTimeout(() => paymentSelectRef.current?.focus(), 0)
      }
      return
    }
    try {
      await request('/investments', {
        method: 'POST',
        body: JSON.stringify({
          assetName: form.assetName,
          assetType: form.assetType,
          quantity: Number(form.quantity),
          currency: form.currency,
          totalSpent: purchaseBreakdown(form.quantity, form.price, form.totalSpent).total,
          price: Number(form.price),
          category: form.category.trim() || undefined,
          purchasedAt: form.purchasedAt || undefined,
          accountId: paymentAccountId(form.accountId)
        })
      })
      setForm(emptyForm())
      setPaymentMissing(0)
      setShowForm(false)
      loadPortfolio()
      loadTransactions()
    } catch (err) {
      setFormError(err.message || 'Something went wrong adding this holding. Please try again.')
    }
  }

  const editingHolding = portfolio?.holdings.find((h) => h.id === editingHoldingId) || null

  // Suggestions for the category input's autocomplete — reusing an exact
  // existing category name (rather than retyping it, which risks a silent
  // typo/whitespace mismatch that would quietly exclude the holding from
  // its intended Target Allocation group) is the whole point of this list.
  const existingCategories = portfolio
    ? Array.from(new Set(portfolio.holdings.map((h) => h.category).filter(Boolean))).sort()
    : []

  function openEdit(holding) {
    setAddPaymentMissing(0)
    setEditingHoldingId(holding.id)
    setEditError('')
    setEditForm({
      name: holding.asset_name,
      price: Number(holding.current_price).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 8 }),
      category: holding.category || '',
      purchasedAt: holding.purchased_at ? holding.purchased_at.slice(0, 10) : '',
      addQty: '',
      addTotalSpent: '',
      addPrice: '',
      addAccountId: '',
      addDate: todayInputValue(),
      removeQty: '',
      removeDate: todayInputValue()
    })
  }

  function closeEdit() {
    setEditingHoldingId(null)
    setEditError('')
  }

  async function refreshEdit() {
    await loadPortfolio()
    await loadTransactions()
  }

  async function handleSaveName() {
    setEditError('')
    if (editForm.name.trim() === '') {
      setEditError('Please enter an asset name.')
      return
    }
    try {
      await request(`/investments/${editingHoldingId}/name`, { method: 'PATCH', body: JSON.stringify({ assetName: editForm.name }) })
      await refreshEdit()
    } catch (err) {
      setEditError(err.message || 'Failed to rename holding')
    }
  }

  async function handleSaveCategory() {
    setEditError('')
    try {
      await request(`/investments/${editingHoldingId}/category`, { method: 'PATCH', body: JSON.stringify({ category: editForm.category.trim() || null }) })
      await refreshEdit()
    } catch (err) {
      setEditError(err.message || 'Failed to update category')
    }
  }

  async function handleSavePrice() {
    setEditError('')
    if (editForm.price === '' || Number(editForm.price) < 0 || Number.isNaN(Number(editForm.price))) {
      setEditError('Please enter a valid price.')
      return
    }
    try {
      await request(`/investments/${editingHoldingId}/price`, { method: 'PATCH', body: JSON.stringify({ currentPrice: Number(editForm.price) }) })
      await refreshEdit()
    } catch (err) {
      setEditError(err.message || 'Failed to update price')
    }
  }

  async function handleSavePurchasedAt() {
    setEditError('')
    try {
      await request(`/investments/${editingHoldingId}/purchased-at`, { method: 'PATCH', body: JSON.stringify({ purchasedAt: editForm.purchasedAt || null }) })
      await refreshEdit()
    } catch (err) {
      setEditError(err.message || 'Failed to update purchase date')
    }
  }

  async function handleAddToHolding() {
    setEditError('')
    const addError = purchaseError(editForm.addQty, editForm.addPrice, editForm.addTotalSpent) || (editForm.addAccountId ? null : PAYMENT_REQUIRED)
    if (addError) {
      setEditError(addError)
      if (!editForm.addAccountId) {
        setAddPaymentMissing((n) => n + 1)
        setTimeout(() => addPaymentSelectRef.current?.focus(), 0)
      }
      return
    }
    try {
      await request(`/investments/${editingHoldingId}/add`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: Number(editForm.addQty),
          totalSpent: purchaseBreakdown(editForm.addQty, editForm.addPrice, editForm.addTotalSpent).total,
          price: Number(editForm.addPrice),
          accountId: paymentAccountId(editForm.addAccountId),
          date: editForm.addDate || undefined
        })
      })
      setEditForm({ ...editForm, addQty: '', addTotalSpent: '', addPrice: '', addAccountId: '', addDate: todayInputValue() })
      await refreshEdit()
    } catch (err) {
      setEditError(err.message || 'Failed to add to holding')
    }
  }

  async function confirmRemove() {
    setConfirmingRemove(false)
    setEditError('')
    try {
      await request(`/investments/${editingHoldingId}/remove`, { method: 'POST', body: JSON.stringify({ quantity: Number(editForm.removeQty || 0), date: editForm.removeDate || undefined }) })
      setEditForm({ ...editForm, removeQty: '', removeDate: todayInputValue() })
      await refreshEdit()
    } catch (err) {
      setEditError(err.message || 'Failed to remove holding')
    }
  }

  function handleRemoveClick() {
    setEditError('')
    if (!editForm.removeQty || !(Number(editForm.removeQty) > 0)) {
      setEditError('Please enter a valid quantity to remove.')
      return
    }
    setConfirmingRemove(true)
  }

  return (
    <div className="space-y-6">
      {/* Shared by both the create form and the edit dialog's Category
          inputs — kept as a single instance so its id is never duplicated
          even if both happen to be open at once. */}
      <datalist id="holding-category-options">
        {existingCategories.map((c) => <option key={c} value={c} />)}
      </datalist>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Investments</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track your holdings and portfolio performance.</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm()); setFormError(''); setPaymentMissing(0); setShowForm((v) => !v) }}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md"
        >
          {showForm ? 'Cancel' : <><Plus size={15} /> Add Holding</>}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader icon={TrendingUp} color="emerald" title="Add Holding" />
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <input placeholder="Asset name" required value={form.assetName} onChange={(e) => setForm({ ...form, assetName: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
            <select required value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm">
              <option value="">Asset Type</option>
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>)}
            </select>
            <input type="number" step="any" placeholder="Quantity" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
            <select required value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, accountId: '' })} className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm">
              <option value="">Currency</option>
              {currencies.length === 0
                ? <option value="IDR">IDR</option>
                : currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="number"
              step="any"
              min="0"
              placeholder={`Price per unit${form.currency ? ` (${form.currency})` : ''}`}
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              title="The price per unit on your trade confirmation, before fees"
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="any"
              min="0"
              placeholder={`Total incl. fee (opt.)${form.currency ? ` (${form.currency})` : ''}`}
              value={form.totalSpent}
              onChange={(e) => setForm({ ...form, totalSpent: e.target.value })}
              title="What actually left your account, fees included. Leave empty if there was no fee."
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            <input
              list="holding-category-options"
              placeholder="Category (optional)"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              title="e.g. Equity Indonesia — groups this holding for Asset Allocation and Target Allocation. Must match an existing category/target name exactly to be grouped with it."
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.purchasedAt}
              onChange={(e) => setForm({ ...form, purchasedAt: e.target.value })}
              title="Purchase date (optional, but needed to compute portfolio CAGR)"
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            <div>
            <select
              key={`pay-${paymentMissing}`}
              ref={paymentSelectRef}
              value={form.accountId}
              onChange={(e) => { setForm({ ...form, accountId: e.target.value }); setPaymentMissing(0) }}
              title="The total paid is taken from this account's balance. Choose 'Other' for a holding bought with money not tracked in this app, e.g. before you started using it."
              className={`${PAY_SELECT_BASE} ${paymentMissing && !form.accountId ? PAY_SELECT_MISSING : PAY_SELECT_OK}`}
            >
              <option value="" disabled className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">Select funding account</option>
              {accounts.filter((a) => !a.is_archived && a.currency === form.currency).map((a) => (
                <option key={a.id} value={a.id} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">{a.name}</option>
              ))}
              <option value="none" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">Other (not tracked in this app)</option>
            </select>
            {paymentMissing > 0 && !form.accountId && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">Select the account used for this purchase</p>}
            </div>
            <PurchaseSummary
              quantity={form.quantity}
              price={form.price}
              totalPaid={form.totalSpent}
              currency={form.currency}
              accountName={form.accountId ? accounts.find((a) => a.id === Number(form.accountId))?.name : null}
              className="col-span-full text-sm text-gray-600 dark:text-gray-400"
            />
            {formError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <button type="submit" className="col-span-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-[1.02] hover:bg-emerald-700 hover:shadow-md">
              Add
            </button>
          </form>
        </div>
      )}

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
      {portfolio?.hasUnconverted && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Some holdings couldn&apos;t be converted to {portfolio.displayCurrency} because we don&apos;t have an exchange rate for that currency yet — they show as &quot;-&quot; below.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading portfolio...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard icon={Wallet} color="blue" label="Total Value" value={formatCurrency(portfolio.totalValue, portfolio.displayCurrency)} />
            <SummaryCard icon={Landmark} color="slate" label="Total Cost Basis" value={formatCurrency(portfolio.totalCostBasis, portfolio.displayCurrency)} />
            <SummaryCard
              icon={TrendingUp}
              color={portfolio.totalUnrealizedGain >= 0 ? 'emerald' : 'red'}
              label="Unrealized Gain"
              value={formatCurrency(portfolio.totalUnrealizedGain, portfolio.displayCurrency)}
            />
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <CardHeader
              icon={TrendingUp}
              color="blue"
              title="Portfolio Value Over Time"
              action={history && (history.length > 1 || historyHoldingId) && (
                <div className="flex flex-wrap items-center gap-1">
                  {/* Outlined with a layers icon, and set apart by a divider,
                      so it reads as "what to show" rather than as one more of
                      the filled time-range buttons beside it. */}
                  <div className="relative">
                    <Layers size={14} className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 ${historyHoldingId ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
                    <select
                      value={historyHoldingId}
                      onChange={(e) => { setHistoryHoldingId(e.target.value); loadHistory(e.target.value) }}
                      className={`cursor-pointer appearance-none rounded-lg border bg-white py-[3px] pl-7 pr-7 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:bg-gray-800 ${
                        historyHoldingId
                          ? 'border-blue-500 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                          : 'border-gray-300 text-gray-700 hover:border-gray-400 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-500'
                      }`}
                    >
                      <option value="" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">All holdings</option>
                      {portfolio.holdings.map((h) => (
                        <option key={h.id} value={String(h.id)} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">{h.asset_name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${historyHoldingId ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
                  </div>
                  <span className="mx-1.5 h-5 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
                  {CHART_RANGES.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => setHistoryRange(r.label)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                        historyRange === r.label ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            />
            {filteredHistory && filteredHistory.length > 1 ? (
              // Brush (Recharts' built-in zoom/pan slider) replaces the old
              // drag-to-scroll wrapper — drag its handles to zoom into a
              // range instead of needing extra width and a manual scrollbar.
              <TrendAreaChart
                data={filteredHistory}
                height={260}
                dataKey="totalValue"
                name="Market value"
                description="what it's worth at market price"
                secondary={{ dataKey: 'totalCostBasis', name: 'Capital invested', description: 'the money you put in, fees included', color: '#3b82f6', solid: true }}
                hint="Both lines rise together when you buy more; the gap between them is your profit, and it only changes when prices move. Dots mark days with a buy or sell."
                markerKey="trades"
                tooltipExtra={(row) => {
                  const lines = []
                  if (row.totalCostBasis !== null && row.totalCostBasis !== undefined) {
                    const profit = row.totalValue - row.totalCostBasis
                    lines.push({ label: 'Profit', value: `${profit >= 0 ? '+' : ''}${formatCurrency(profit, portfolio.displayCurrency)}`, tone: profit >= 0 ? 'up' : 'down' })
                  }
                  for (const trade of row.trades || []) lines.push({ label: trade })
                  return lines
                }}
                formatValue={(value) => formatCurrency(value, portfolio.displayCurrency)}
                formatAxisValue={formatNumber}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <TrendingUp size={24} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Not enough history yet — we save your portfolio value once a day, so this chart will fill in over the next few days.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <CardHeader
              icon={PieChart}
              color="blue"
              title="All Holdings Over Time"
              subtitle="Click a name below to hide/show its line"
              action={holdingsHistory && holdingsHistory.data.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {CHART_RANGES.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => setHoldingsRange(r.label)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                        holdingsRange === r.label ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            />
            {filteredHoldingsHistory && filteredHoldingsHistory.length > 1 ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {holdingsHistory.series.map((s, i) => {
                    const color = getHoldingColor(s.name, i)
                    const hidden = hiddenHoldingKeys.has(s.key)
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleHoldingLine(s.key)}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150 hover:scale-105 ${hidden ? 'bg-gray-50 dark:bg-gray-900/40 text-gray-400 dark:text-gray-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hidden ? '#9ca3af' : color }} />
                        {s.name}
                      </button>
                    )
                  })}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={filteredHoldingsHistory} margin={{ top: 10, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={timeAxisTicks(filteredHoldingsHistory)} tickFormatter={timeAxisFormatter(filteredHoldingsHistory)} fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={formatNumber} width={130} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelFormatter={timeTooltipFormatter(filteredHoldingsHistory)}
                      formatter={(value, name) => [formatCurrency(value, holdingsHistory.displayCurrency), name]}
                    />
                    {holdingsHistory.series
                      .filter((s) => !hiddenHoldingKeys.has(s.key))
                      .map((s) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.name}
                          stroke={getHoldingColor(s.name, holdingsHistory.series.findIndex((x) => x.key === s.key))}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls
                        />
                      ))}
                    <Brush dataKey="ts" height={26} stroke="var(--chart-grid)" fill="var(--tooltip-bg)" tickFormatter={timeAxisFormatter(filteredHoldingsHistory)} travellerWidth={10} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <PieChart size={24} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Not enough history yet — we save each holding&apos;s value once a day, so this chart will fill in over the next few days.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
          <div ref={holdingsCardRef} className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 lg:col-span-2">
            <CardHeader icon={PieChart} color="violet" title="Holdings" />
            {portfolio.holdings.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <TrendingUp size={28} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No holdings yet.</p>
              </div>
            ) : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Asset</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Last Price</th>
                      <th className="px-3 py-2">Value</th>
                      <th className="px-3 py-2">Return</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings.map((h) => {
                      const TypeIcon = ASSET_TYPE_ICONS[h.asset_type] || Wallet
                      return (
                        <tr key={h.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60">
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                              <TypeIcon size={14} className="shrink-0 text-gray-400 dark:text-gray-500" />
                              <Link href={`/investments/${h.id}`} title="View details" className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400">{h.asset_name}</Link>
                              <span className="text-xs font-normal text-gray-400 dark:text-gray-500">({ASSET_TYPE_LABELS[h.asset_type] || h.asset_type})</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{formatQuantity(h.quantity)}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{formatCurrency(h.current_price, h.currency)}</td>
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                            {formatCurrency(Number(h.quantity) * Number(h.current_price), h.currency)}
                            {/* The portfolio totals above are in the display currency, so show what this adds to them. */}
                            {h.currency !== portfolio.displayCurrency && h.currentValue !== null && (
                              <span className="block text-xs text-gray-400 dark:text-gray-500">≈ {formatCurrency(h.currentValue, portfolio.displayCurrency)}</span>
                            )}
                          </td>
                          <td title="Return without fees, like your broker app shows — open the holding for the return after fees" className={`px-3 py-2 font-medium ${h.returnPercentageExcludingFees === null ? 'text-gray-400 dark:text-gray-500' : h.returnPercentageExcludingFees >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {h.returnPercentageExcludingFees === null ? 'N/A' : `${h.returnPercentageExcludingFees >= 0 ? '+' : ''}${h.returnPercentageExcludingFees}%`}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => openEdit(h)} title="Edit holding" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300">
                              <Pencil size={17} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div
            className="flex flex-col rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700"
            style={holdingsCardHeight ? { maxHeight: holdingsCardHeight } : undefined}
          >
            <CardHeader
              icon={History}
              color="violet"
              title="Transaction History"
              subtitle="Price updates aren't logged here"
              action={transactions.length > 0 && (
                <button onClick={() => setShowAllTransactions(true)} className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">
                  View all
                </button>
              )}
            />
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <History size={24} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No buy/sell transactions yet.</p>
              </div>
            ) : (
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {transactions.map((t) => {
                  const isBuy = t.type === 'buy'
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isBuy ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500' : 'bg-red-50 dark:bg-red-900/30 text-red-500'}`}>
                          {isBuy ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {isBuy ? 'Buy' : 'Sell'} {t.asset_name}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(t.occurred_at).toLocaleDateString()} · {formatQuantity(t.quantity)} unit</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatCurrency(t.total_amount, t.currency)}</p>
                        {t.realized_gain !== null && (
                          <p className={`text-xs font-medium ${Number(t.realized_gain) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {Number(t.realized_gain) >= 0 ? '+' : ''}{formatCurrency(t.realized_gain, t.currency)}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          </div>
        </>
      )}

      {showAllTransactions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAllTransactions(false)}>
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">All Transactions ({transactions.length})</h3>
              <button onClick={() => setShowAllTransactions(false)} className="text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Asset</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Fee</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const isBuy = t.type === 'buy'
                    return (
                      <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-600 dark:text-gray-400">{new Date(t.occurred_at).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                          {t.holding_id ? <Link href={`/investments/${t.holding_id}`} className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400">{t.asset_name}</Link> : t.asset_name}
                        </td>
                        <td className={`px-4 py-2.5 text-xs font-semibold ${isBuy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{isBuy ? 'Buy' : 'Sell'}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">{formatQuantity(t.quantity)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{formatCurrency(t.price_per_unit, t.currency)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-gray-600 dark:text-gray-400">{t.fee === null ? '' : formatCurrency(t.fee, t.currency)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(t.total_amount, t.currency)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {editingHolding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeEdit}>
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit {editingHolding.asset_name}</h2>
              <button onClick={closeEdit} className="rounded-lg p-1 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 p-3 text-sm">
              <div>
                <p className="text-xs uppercase text-gray-400 dark:text-gray-500">Qty</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{formatQuantity(editingHolding.quantity)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 dark:text-gray-500">Value</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(editingHolding.currentValue, portfolio.displayCurrency)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 dark:text-gray-500">Return</p>
                <p className={`font-medium ${editingHolding.returnPercentageExcludingFees === null ? 'text-gray-400 dark:text-gray-500' : editingHolding.returnPercentageExcludingFees >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {editingHolding.returnPercentageExcludingFees === null ? 'N/A' : `${editingHolding.returnPercentageExcludingFees}%`}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 dark:text-gray-500">Currency</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{editingHolding.currency}</p>
              </div>
            </div>

            {editError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{editError}</p>}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Rename</label>
                <div className="flex gap-2">
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                  <button onClick={handleSaveName} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500">Save</button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Current Price</label>
                <div className="flex gap-2">
                  <input type="number" step="any" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                  <button onClick={handleSavePrice} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500">Save</button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400" title="Groups this holding for Asset Allocation and Target Allocation">Category</label>
                <div className="flex gap-2">
                  <input
                    list="holding-category-options"
                    placeholder="Category (optional)"
                    title="e.g. Equity Indonesia"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
                  />
                  <button onClick={handleSaveCategory} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500">Save</button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400" title="Used to compute portfolio CAGR">First Purchase Date</label>
                <div className="flex gap-2">
                  <input type="date" value={editForm.purchasedAt} onChange={(e) => setEditForm({ ...editForm, purchasedAt: e.target.value })} className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                  <button onClick={handleSavePurchasedAt} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500">Save</button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Add Quantity (e.g. monthly top-up / DCA)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="any" min="0" placeholder="Quantity" value={editForm.addQty} onChange={(e) => setEditForm({ ...editForm, addQty: e.target.value })} className="min-w-0 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder={`Price per unit (${editingHolding.currency})`}
                    title="The price per unit on your trade confirmation, before fees"
                    value={editForm.addPrice}
                    onChange={(e) => setEditForm({ ...editForm, addPrice: e.target.value })}
                    className="min-w-0 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Total incl. fee (opt.)"
                    title="What actually left your account, fees included. Leave empty if there was no fee."
                    value={editForm.addTotalSpent}
                    onChange={(e) => setEditForm({ ...editForm, addTotalSpent: e.target.value })}
                    className="min-w-0 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
                  />
                  <input type="date" title="Date of this purchase" value={editForm.addDate} max={todayInputValue()} onChange={(e) => setEditForm({ ...editForm, addDate: e.target.value })} className="min-w-0 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                  <div className="col-span-2 min-w-0">
                  <select
                    key={`add-pay-${addPaymentMissing}`}
                    ref={addPaymentSelectRef}
                    value={editForm.addAccountId}
                    onChange={(e) => { setEditForm({ ...editForm, addAccountId: e.target.value }); setAddPaymentMissing(0) }}
                    title="The total paid is taken from this account's balance. Choose 'Other' only for money not tracked in this app."
                    className={`${PAY_SELECT_BASE} ${addPaymentMissing && !editForm.addAccountId ? PAY_SELECT_MISSING : PAY_SELECT_OK}`}
                  >
                    <option value="" disabled className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">Select funding account</option>
                    {accounts.filter((a) => !a.is_archived && a.currency === editingHolding.currency).map((a) => (
                      <option key={a.id} value={a.id} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">{a.name}</option>
                    ))}
                    <option value="none" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">Other (not tracked in this app)</option>
                  </select>
                  {addPaymentMissing > 0 && !editForm.addAccountId && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">Select the account used for this purchase</p>}
                  </div>
                </div>
                <PurchaseSummary
                  quantity={editForm.addQty}
                  price={editForm.addPrice}
                  totalPaid={editForm.addTotalSpent}
                  currency={editingHolding.currency}
                  accountName={editForm.addAccountId ? accounts.find((a) => a.id === Number(editForm.addAccountId))?.name : null}
                  className="mt-1 text-xs text-gray-500 dark:text-gray-400"
                />
                <button onClick={handleAddToHolding} className="mt-2 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-emerald-700">Add</button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Remove Quantity (e.g. on sale)</label>
                <div className="flex gap-2">
                  <input type="number" step="any" placeholder="Qty" value={editForm.removeQty} onChange={(e) => setEditForm({ ...editForm, removeQty: e.target.value })} className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                  <input type="date" title="Date of this sale" value={editForm.removeDate} max={todayInputValue()} onChange={(e) => setEditForm({ ...editForm, removeDate: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                  <button onClick={handleRemoveClick} className="rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-red-600">Remove</button>
                </div>
              </div>
            </div>

            <button onClick={closeEdit} className="mt-5 w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 py-2 text-sm font-medium">
              Done
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingRemove}
        title="Remove this quantity?"
        message={editingHolding && `This removes ${editForm.removeQty} unit(s) of ${editingHolding.asset_name}${Number(editForm.removeQty) >= Number(editingHolding.quantity) ? ' — closing out the entire holding' : ''}. This can't be undone.`}
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setConfirmingRemove(false)}
      />
    </div>
  )
}
