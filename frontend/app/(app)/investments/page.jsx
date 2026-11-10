'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from 'recharts'
import { Pencil, X, Plus, Minus, TrendingUp, PieChart, Bitcoin, Package, Landmark, Coins, Building2, Wallet, ArrowUpRight, ArrowDownRight, History, ChevronDown, Layers, Zap, RefreshCw } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatNumber, formatQuantity } from '@/lib/format'
import { CHART_RANGES, applyChartRange, withTimestamps, timeAxisTicks, timeAxisFormatter, timeTooltipFormatter } from '@/lib/chartRanges'
import TrendAreaChart from '@/components/TrendAreaChart'
import CardHeader from '@/components/CardHeader'
import SellHoldingModal from '@/components/SellHoldingModal'
import BuyHoldingModal from '@/components/BuyHoldingModal'
import MarketSearch from '@/components/MarketSearch'
import AutoPriceReview from '@/components/AutoPriceReview'
import PortfolioSummary from '@/components/PortfolioSummary'

// Recharts' Tooltip takes literal colors via contentStyle, not Tailwind
// classes — these CSS variables (defined in globals.css) are the dark-mode
// bridge for it, same as the Dashboard/Reports charts.
const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: 8,
  color: 'var(--tooltip-text)'
}

// Hues far enough apart to tell lines apart at a glance (no teal next to
// green, no amber next to orange).
const HOLDING_LINE_COLORS = ['#2563eb', '#10b981', '#f97316', '#ef4444', '#8b5cf6', '#ec4899', '#eab308', '#06b6d4', '#92400e', '#64748b', '#84cc16', '#1e3a8a']

// Preferred colors for specific holdings. Matched anywhere in the name as
// well as exactly, because the legend label can have " (category)" appended
// to the raw asset name — e.g. "BTC (Crypto)", "BTC (Binance) (Crypto)".
const HOLDING_NAME_COLORS = {
  BTC: '#f97316',
  BBCA: '#2563eb',
  Binance: '#eab308',
  Sucorinvest: '#10b981'
}

// One color per series, never the same twice: exact name matches get their
// preferred color first, then names containing one whose color is still free
// ("BTC (Binance)" takes Binance's yellow, not BTC's orange), then
// everything else takes the next unused palette color.
function buildHoldingColors(series) {
  const colors = new Map()
  const used = new Set()
  const assign = (key, color) => {
    colors.set(key, color)
    used.add(color)
  }
  for (const s of series) {
    const color = HOLDING_NAME_COLORS[s.name]
    if (color && !used.has(color)) assign(s.key, color)
  }
  for (const s of series) {
    if (colors.has(s.key)) continue
    const matchedKey = Object.keys(HOLDING_NAME_COLORS).find((key) => s.name.includes(key) && !used.has(HOLDING_NAME_COLORS[key]))
    if (matchedKey) assign(s.key, HOLDING_NAME_COLORS[matchedKey])
  }
  let next = 0
  for (const s of series) {
    if (colors.has(s.key)) continue
    const free = HOLDING_LINE_COLORS.find((c) => !used.has(c))
    assign(s.key, free || HOLDING_LINE_COLORS[next++ % HOLDING_LINE_COLORS.length])
  }
  return colors
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

// Types that can have a market listing, so worth offering automatic prices for.
const MARKET_TYPES = ['stock', 'etf', 'crypto', 'mutual_fund']
const SOURCE_LABELS = { yahoo: 'Yahoo Finance', indodax: 'Indodax' }
const BANNER_DISMISSED_KEY = 'autoPriceBannerDismissed'

const timeAgo = (value) => {
  if (!value) return null
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

// "Auto" / "Manual" / "⚠️ Not updated" next to a holding's last price.
function PriceBadge({ holding }) {
  if (!holding.price_source) {
    return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">Manual</span>
  }
  if (holding.price_error) {
    return (
      <span title={`Couldn't update the price: ${holding.price_error}. Showing the last price from ${timeAgo(holding.price_updated_at) || 'earlier'}.`} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        ⚠️ Not updated
      </span>
    )
  }
  return (
    <span title={`${holding.price_symbol} on ${SOURCE_LABELS[holding.price_source] || holding.price_source} · updated ${timeAgo(holding.price_updated_at)}`} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      Auto
    </span>
  )
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
  const paymentSelectRef = useRef(null)

  const [editingHoldingId, setEditingHoldingId] = useState(null)
  // Same idea as the Accounts page's Transfers card: Transaction History is
  // capped to the Holdings card's live-measured height so it never makes the
  // row taller than the holdings list — older entries scroll inside it, and
  // "View all" opens the full list.
  const holdingsCardRef = useRef(null)
  const [holdingsCardHeight, setHoldingsCardHeight] = useState(null)
  const [showAllTransactions, setShowAllTransactions] = useState(false)

  // Automatic prices.
  const [showAutoReview, setShowAutoReview] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(BANNER_DISMISSED_KEY) === '1' } catch { return false }
  })
  const [refreshingPrices, setRefreshingPrices] = useState(false)
  const [priceMessage, setPriceMessage] = useState('')
  const [formListing, setFormListing] = useState(null) // market listing chosen in Add Holding
  // Add Holding step 1: null until an asset is picked, then 'market' (a
  // listing, priced automatically) or 'custom' (typed in, priced by hand).
  const [assetMode, setAssetMode] = useState(null)
  const [editSearching, setEditSearching] = useState(false)

  useEffect(() => {
    const el = holdingsCardRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setHoldingsCardHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [portfolio])

  const [editForm, setEditForm] = useState({ name: '', price: '' })
  const [editError, setEditError] = useState('')
  const [sellingHoldingId, setSellingHoldingId] = useState(null)
  const [buyingHoldingId, setBuyingHoldingId] = useState(null)
  // The open row menu: which holding, and where to draw it (fixed to the
  // viewport so the table's horizontal scroll box can't clip it).
  const [rowMenu, setRowMenu] = useState(null)
  // How the investments did over the range picked on the value chart (or the
  // current budget cycle): price changes only, in total or for the holding
  // picked there. `cycleFirstDay` is the first day of the current cycle, which
  // the chart's "Cycle" range starts from.
  const [performance, setPerformance] = useState(null)
  const [cycleFirstDay, setCycleFirstDay] = useState(null)
  const performanceKey = portfolio?.totalValue
  const historyStart = history?.[0]?.date || null
  useEffect(() => {
    let cancelled = false
    async function loadPerformance() {
      const today = localDateKey(new Date())
      const range = CHART_RANGES.find((r) => r.label === historyRange)
      let queryString = 'periodOffset=0'
      if (historyRange !== 'Cycle') {
        let from = null
        if (range?.ytd) from = `${new Date().getFullYear()}-01-01`
        else if (Number.isFinite(range?.days)) {
          const d = new Date()
          d.setDate(d.getDate() - (range.days - 1))
          from = localDateKey(d)
        } else from = historyStart
        if (!from) return
        queryString = `startDate=${from}&endDate=${today}`
      }
      try {
        const data = await request(`/investments/performance?${queryString}`)
        if (cancelled) return
        setPerformance(data)
        if (historyRange === 'Cycle') setCycleFirstDay(data.firstDay)
      } catch {
        // The result is a bonus view; the rest of the page still works.
      }
    }
    loadPerformance()
    return () => { cancelled = true }
  }, [historyRange, historyStart, performanceKey])
  useEffect(() => {
    async function loadCycleStart() {
      try {
        setCycleFirstDay((await request('/investments/performance?periodOffset=0')).firstDay)
      } catch {
        // Without it the Cycle range simply shows everything.
      }
    }
    loadCycleStart()
  }, [])

  const filteredHistory = useMemo(() => {
    const cycleRows = historyRange === 'Cycle' && history && cycleFirstDay ? history.filter((h) => h.date >= cycleFirstDay) : null
    const rows = cycleRows && cycleRows.length > 1 ? cycleRows : applyChartRange(history, historyRange === 'Cycle' ? 'All' : historyRange)
    if (!rows) return rows
    // Trades before the range's first day belong to earlier history; one on
    // that first day is marked on it.
    const firstKey = rows[0]?.date
    const shownTrades = transactions.filter((t) => (
      (!historyHoldingId || String(t.holding_id) === historyHoldingId)
      && firstKey && localDateKey(t.occurred_at) >= (firstKey.length === 7 ? `${firstKey}-01` : firstKey)
    ))
    return withTimestamps(withTrades(rows, shownTrades))
  }, [history, historyRange, historyHoldingId, transactions, cycleFirstDay])

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

  function dismissBanner() {
    setBannerDismissed(true)
    try { window.localStorage.setItem(BANNER_DISMISSED_KEY, '1') } catch { /* private mode: dismissed for this visit only */ }
  }

  async function handleRefreshPrices() {
    setRefreshingPrices(true)
    setPriceMessage('')
    try {
      const result = await request('/investments/prices/refresh', { method: 'POST' })
      setPriceMessage(result.failed.length > 0
        ? `Updated ${result.updated}; couldn't update ${result.failed.map((f) => f.assetName).join(', ')} — their last price is kept.`
        : `Updated ${result.updated} price${result.updated === 1 ? '' : 's'}.`)
      await loadPortfolio()
      loadHistory()
    } catch (err) {
      setPriceMessage(err.message || "Couldn't update prices")
    } finally {
      setRefreshingPrices(false)
    }
  }

  // Picking a listing in Add Holding fills in what the market already knows.
  function chooseFormListing(listing) {
    setFormListing(listing)
    setAssetMode('market')
    setForm((f) => ({
      ...f,
      assetName: listing.symbol.split(/[.-]/)[0].replace(/idr$/, '').toUpperCase(),
      assetType: listing.assetType || f.assetType,
      currency: listing.currency,
      price: f.price || String(listing.price),
      accountId: f.currency === listing.currency ? f.accountId : ''
    }))
  }

  function chooseCustomAsset(name) {
    setFormListing(null)
    setAssetMode('custom')
    setForm((f) => ({ ...f, assetName: name, assetType: '', currency: '', price: '', accountId: '' }))
  }

  function resetAssetChoice() {
    setFormListing(null)
    setAssetMode(null)
    setForm((f) => ({ ...f, assetName: '', assetType: '', currency: '', price: '', accountId: '' }))
  }

  async function linkEditingHolding(listing) {
    setEditError('')
    try {
      await request(`/investments/${editingHoldingId}/price-source`, { method: 'PUT', body: JSON.stringify({ source: listing.source, symbol: listing.symbol }) })
      setEditSearching(false)
      await refreshEdit()
    } catch (err) {
      setEditError(err.message || "Couldn't link this holding to the market")
    }
  }

  async function unlinkEditingHolding() {
    setEditError('')
    try {
      await request(`/investments/${editingHoldingId}/price-source`, { method: 'DELETE' })
      await refreshEdit()
    } catch (err) {
      setEditError(err.message || "Couldn't switch to manual")
    }
  }

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
          accountId: paymentAccountId(form.accountId),
          priceSource: formListing?.source,
          priceSymbol: formListing?.symbol
        })
      })
      setForm(emptyForm())
      setFormListing(null)
      setAssetMode(null)
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
    setEditSearching(false)
    setEditingHoldingId(holding.id)
    setEditError('')
    setEditForm({
      name: holding.asset_name,
      price: Number(holding.current_price).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 8 }),
      category: holding.category || '',
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

  function openBuy(holding) {
    setBuyingHoldingId(holding.id)
  }

  function openSell(holdingId) {
    setSellingHoldingId(holdingId)
  }

  const holdingColors = buildHoldingColors(holdingsHistory?.series || [])

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
          onClick={() => { setForm(emptyForm()); setFormError(''); setPaymentMissing(0); setFormListing(null); setAssetMode(null); setShowForm((v) => !v) }}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md"
        >
          {showForm ? 'Cancel' : <><Plus size={15} /> Add Holding</>}
        </button>
      </div>

      {portfolio && !bannerDismissed && portfolio.holdings.some((h) => !h.price_source && MARKET_TYPES.includes(h.asset_type)) && (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-blue-100 dark:bg-gray-800 dark:ring-blue-900/50 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"><Zap size={20} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Keep prices up to date automatically</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Link your stocks, ETFs and crypto to their market listing and their last price updates every day — no more typing it in.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={dismissBanner} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">Not now</button>
            <button onClick={() => setShowAutoReview(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Review &amp; turn on</button>
          </div>
        </div>
      )}

      {showAutoReview && (
        <AutoPriceReview
          onClose={() => setShowAutoReview(false)}
          onDone={() => { setShowAutoReview(false); dismissBanner(); loadPortfolio(); loadHistory() }}
        />
      )}

      {showForm && (
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader icon={TrendingUp} color="emerald" title="Add Holding" />
          <form onSubmit={handleCreate} className="space-y-5">
            {/* Step 1: the asset — one place to start, a market listing or a custom asset. */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Asset</label>
              {assetMode === null && (
                <MarketSearch onSelect={chooseFormListing} onCustom={chooseCustomAsset} autoFocus />
              )}
              {assetMode === 'market' && formListing && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{formListing.name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {formListing.symbol} · {formListing.exchange} · {formListing.currency} · {ASSET_TYPE_LABELS[form.assetType] || form.assetType}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"><Zap size={12} /> Price updates automatically · saved as “{form.assetName}”</p>
                  </div>
                  <button type="button" onClick={resetAssetChoice} className="text-xs font-medium text-gray-600 hover:underline dark:text-gray-300">Change</button>
                </div>
              )}
              {assetMode === 'custom' && (
                <div className="rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-600">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{form.assetName} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">· Custom asset, price entered manually</span></p>
                    <button type="button" onClick={resetAssetChoice} className="text-xs font-medium text-gray-600 hover:underline dark:text-gray-300">Change</button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
                      <input required value={form.assetName} onChange={(e) => setForm({ ...form, assetName: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Type</label>
                      <select required value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm">
                        <option value="" disabled className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">Select type</option>
                        {ASSET_TYPES.map((t) => <option key={t} value={t} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">{ASSET_TYPE_LABELS[t]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Currency</label>
                      <select required value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, accountId: '' })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm">
                        <option value="" disabled className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">Select currency</option>
                        {(currencies.length === 0 ? ['IDR'] : currencies).map((c) => <option key={c} value={c} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: the purchase, once the asset is known. */}
            {assetMode !== null && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Purchase details</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Quantity</label>
                    <input type="number" step="any" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400" title="The price per unit on your trade confirmation, before fees">Price per unit{form.currency ? ` (${form.currency})` : ''}</label>
                    <input type="number" step="any" min="0" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400" title="What actually left your account, fees included. Leave empty if there was no fee.">Total paid{form.currency ? ` (${form.currency})` : ''}, incl. fees <span className="text-gray-400">· optional</span></label>
                    <input type="number" step="any" min="0" value={form.totalSpent} onChange={(e) => setForm({ ...form, totalSpent: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400" title="The date of this purchase — it is recorded as the first buy in the holding's history">Purchase date</label>
                    <input type="date" value={form.purchasedAt} max={todayInputValue()} onChange={(e) => setForm({ ...form, purchasedAt: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Funding account</label>
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
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400" title="e.g. Equity Indonesia — groups this holding for Asset Allocation and Target Allocation. Must match an existing category/target name exactly to be grouped with it.">Category <span className="text-gray-400">· optional</span></label>
                    <input list="holding-category-options" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Equity Indonesia" className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
                  </div>
                </div>
                <PurchaseSummary
                  quantity={form.quantity}
                  price={form.price}
                  totalPaid={form.totalSpent}
                  currency={form.currency}
                  accountName={form.accountId ? accounts.find((a) => a.id === Number(form.accountId))?.name : null}
                  className="mt-3 text-sm text-gray-600 dark:text-gray-400"
                />
              </div>
            )}

            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            {assetMode !== null && (
              <button type="submit" className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-emerald-700 hover:shadow-md">
                Add holding
              </button>
            )}
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
          <PortfolioSummary portfolio={portfolio} />

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
                  {[...CHART_RANGES.filter((r) => r.label !== '1Y' && r.label !== '5Y' && r.label !== 'All'), { label: 'Cycle' }, ...CHART_RANGES.filter((r) => r.label === '1Y' || r.label === '5Y' || r.label === 'All')].map((r) => (
                    <button
                      key={r.label}
                      title={r.label === 'Cycle' ? 'The current budget cycle' : undefined}
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
            {(() => {
              // Heads the chart: how the portfolio — or the one holding picked —
              // did over the range chosen above, from price changes only.
              const picked = historyHoldingId ? portfolio.holdings.find((h) => String(h.id) === historyHoldingId) : null
              if (!performance) return null
              const result = picked
                ? performance.holdings.find((h) => h.id === picked.id)
                : { pnl: performance.pnl, percent: performance.percent, any: performance.holdings.length > 0 }
              const currency = performance.displayCurrency
              const name = picked ? picked.asset_name : 'All holdings'
              const rangeName = historyRange === 'Cycle' ? 'this cycle' : historyRange === 'All' ? 'since the start' : historyRange === 'YTD' ? 'this year' : `last ${historyRange}`
              if (!result || (!picked && !result.any)) {
                return <p className="mb-4 text-sm text-gray-400 dark:text-gray-500">{picked ? `You didn't hold ${picked.asset_name} ${rangeName}.` : `No investments ${rangeName}.`}</p>
              }
              const up = result.pnl >= 0
              return (
                <div className="mb-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {name} · result {rangeName}
                    <span className="ml-1.5 font-normal normal-case tracking-normal">({performance.periodLabel})</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`inline-flex items-center gap-1 text-2xl font-semibold tracking-tight ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {up ? <ArrowUpRight size={22} strokeWidth={2.5} /> : <ArrowDownRight size={22} strokeWidth={2.5} />}
                      {up ? '+' : '−'}{formatCurrency(Math.abs(result.pnl), currency)}
                    </span>
                    {result.percent !== null && (
                      <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${up ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {up ? '+' : '−'}{Math.abs(result.percent)}%
                      </span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500" title="Only price changes count. Fees, and money you bought or sold, don't">
                      {up ? 'Up' : 'Down'} because prices {up ? 'rose' : 'fell'}
                    </span>
                    {picked && <Link href={`/investments/${picked.id}`} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">View details →</Link>}
                  </div>
                </div>
              )
            })()}
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
                hint="Both lines rise together when you buy more; the gap between them is your profit, and it only changes when prices move."
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
                formatAxisValue={(v) => formatNumber(Math.round(v))}
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
                  {holdingsHistory.series.map((s) => {
                    const color = holdingColors.get(s.key)
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
                          stroke={holdingColors.get(s.key)}
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
            <CardHeader
              icon={PieChart}
              color="violet"
              title="Holdings"
              action={(portfolio.holdings.some((h) => h.price_source) || portfolio.holdings.some((h) => !h.price_source && MARKET_TYPES.includes(h.asset_type))) && (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  {/* Reopens the review any time, also after the banner was dismissed. */}
                  {portfolio.holdings.some((h) => !h.price_source && MARKET_TYPES.includes(h.asset_type)) && (
                    <button onClick={() => setShowAutoReview(true)} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400">
                      <Zap size={12} /> Set up automatic prices
                    </button>
                  )}
                  {portfolio.holdings.some((h) => h.price_source) && (<>
                  <span className="hidden sm:inline">
                    Prices updated {timeAgo(portfolio.holdings.filter((h) => h.price_updated_at).map((h) => h.price_updated_at).sort()[0]) || '—'}
                  </span>
                  <button
                    onClick={handleRefreshPrices}
                    disabled={refreshingPrices}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <RefreshCw size={12} className={refreshingPrices ? 'animate-spin' : ''} /> {refreshingPrices ? 'Updating…' : 'Update prices'}
                  </button>
                  </>)}
                </div>
              )}
            />
            {priceMessage && <p className="-mt-2 mb-3 text-xs text-gray-500 dark:text-gray-400">{priceMessage}</p>}
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
                              <span title={ASSET_TYPE_LABELS[h.asset_type] || h.asset_type} className="shrink-0"><TypeIcon size={14} className="text-gray-400 dark:text-gray-500" /></span>
                              <Link href={`/investments/${h.id}`} title="View details" className="hover:text-emerald-600 hover:underline dark:hover:text-emerald-400">{h.asset_name}</Link>
                            </span>
                            <span className="block pl-[22px] text-xs text-gray-400 dark:text-gray-500">{ASSET_TYPE_LABELS[h.asset_type] || h.asset_type}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{formatQuantity(h.quantity)}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                            <span className="block whitespace-nowrap">{formatCurrency(h.current_price, h.currency)}</span>
                            <PriceBadge holding={h} />
                          </td>
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
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <button
                              onClick={(e) => {
                                const r = e.currentTarget.getBoundingClientRect()
                                setRowMenu(rowMenu?.id === h.id ? null : { id: h.id, top: r.bottom + 4, right: window.innerWidth - r.right })
                              }}
                              title="Buy or sell"
                              aria-label={`Buy or sell ${h.asset_name}`}
                              aria-expanded={rowMenu?.id === h.id}
                              className={`inline-flex items-center gap-0.5 rounded-lg border px-2 py-1 text-xs font-medium transition-colors duration-150 ${rowMenu?.id === h.id ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'border-gray-300 text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-gray-600 dark:text-gray-200 dark:hover:border-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300'}`}
                            >
                              Trade <ChevronDown size={13} className={`transition-transform duration-150 ${rowMenu?.id === h.id ? 'rotate-180' : ''}`} />
                            </button>
                            <button onClick={() => openEdit(h)} title="Edit holding" aria-label={`Edit ${h.asset_name}`} className="ml-0.5 rounded-md p-1 align-middle text-gray-400 transition-all duration-150 hover:scale-110 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300">
                              <Pencil size={16} />
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
                          <p title="Profit or loss on this sale, after fees and tax" className={`text-xs font-medium ${Number(t.realized_gain) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
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
                {editingHolding.price_source ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-600 dark:bg-gray-900/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(editingHolding.current_price, editingHolding.currency)}</span>
                      <PriceBadge holding={editingHolding} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Updates automatically from {SOURCE_LABELS[editingHolding.price_source] || editingHolding.price_source} ({editingHolding.price_symbol}) · last updated {timeAgo(editingHolding.price_updated_at) || '—'}
                    </p>
                    {editingHolding.price_error && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Last try failed: {editingHolding.price_error}</p>}
                    <button onClick={unlinkEditingHolding} className="mt-2 text-xs font-medium text-gray-500 underline hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">Switch to manual</button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input type="number" step="any" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                      <button onClick={handleSavePrice} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500">Save</button>
                    </div>
                    {editSearching ? (
                      <div className="mt-2">
                        <MarketSearch currency={editingHolding.currency} autoFocus onSelect={linkEditingHolding} />
                        <button onClick={() => setEditSearching(false)} className="mt-1 text-xs text-gray-400 hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditSearching(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                        <Zap size={12} /> Update this price automatically…
                      </button>
                    )}
                  </>
                )}
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
            </div>

            <button onClick={closeEdit} className="mt-5 w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 py-2 text-sm font-medium">
              Done
            </button>
          </div>
        </div>
      )}

      {rowMenu && (() => {
        const h = portfolio?.holdings.find((x) => x.id === rowMenu.id)
        if (!h) return null
        const canSell = Number(h.quantity) > 0
        const item = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-100'
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} onWheel={() => setRowMenu(null)} onTouchMove={() => setRowMenu(null)} />
            <div role="menu" style={{ top: rowMenu.top, right: rowMenu.right }} className="fixed z-50 w-40 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
              <button role="menuitem" onClick={() => { setRowMenu(null); openBuy(h) }} className={`${item} text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-gray-200 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400`}>
                <Plus size={16} className="text-emerald-600 dark:text-emerald-400" /> Buy
              </button>
              <button role="menuitem" disabled={!canSell} onClick={() => { setRowMenu(null); openSell(h.id) }} className={`${item} text-gray-700 enabled:hover:bg-red-50 enabled:hover:text-red-700 disabled:opacity-40 dark:text-gray-200 dark:enabled:hover:bg-red-900/30 dark:enabled:hover:text-red-400`}>
                <Minus size={16} className="text-red-600 dark:text-red-400" /> Sell
              </button>
            </div>
          </>
        )
      })()}

      {buyingHoldingId && (() => {
        const h = portfolio?.holdings.find((x) => x.id === buyingHoldingId)
        if (!h) return null
        return (
          <BuyHoldingModal
            holding={{ id: h.id, name: h.asset_name, currency: h.currency, quantity: h.quantity, currentPrice: h.current_price, costBasisTotal: h.cost_basis_total }}
            accounts={accounts}
            onClose={() => setBuyingHoldingId(null)}
            onBought={() => { setBuyingHoldingId(null); loadPortfolio(); loadTransactions(); loadHistory() }}
          />
        )
      })()}

      {sellingHoldingId && (() => {
        const h = portfolio?.holdings.find((x) => x.id === sellingHoldingId)
        if (!h) return null
        return (
          <SellHoldingModal
            holding={{ id: h.id, name: h.asset_name, currency: h.currency, quantity: h.quantity, currentPrice: h.current_price, costBasisTotal: h.cost_basis_total }}
            accounts={accounts}
            onClose={() => setSellingHoldingId(null)}
            onSold={() => { setSellingHoldingId(null); loadPortfolio(); loadTransactions(); loadHistory() }}
          />
        )
      })()}
    </div>
  )
}
