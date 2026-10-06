'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'
import CardHeader from '@/components/CardHeader'
import ConfirmDialog from '@/components/ConfirmDialog'
import SummaryCard from '@/components/SummaryCard'
import { Plus, SlidersHorizontal, ArrowLeftRight, ArrowUpRight, ArrowDownRight, Pencil, Trash2, Receipt, X, TrendingUp, TrendingDown, Scale, Tag, Split, AlertTriangle } from 'lucide-react'

const TYPES = ['income', 'expense']

// A distinct, deterministic color per category (by its position in the
// sorted category list) so the same category always reads the same color
// across the table — inspired by how Copilot Money uses a colored icon per
// category so the feed can be scanned visually instead of read row by row.
const CATEGORY_BADGE_COLORS = [
  'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  'bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
  'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
  'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
]

function categoryBadgeColor(categoryId, categories) {
  const index = categories.findIndex((c) => c.id === categoryId)
  if (index === -1) return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
  return CATEGORY_BADGE_COLORS[index % CATEGORY_BADGE_COLORS.length]
}

// Uses local date parts (not toISOString().slice(0,10), which is UTC-based
// and can land on the wrong calendar day) so the date input matches what
// the table's toLocaleDateString() already shows for the same transaction.
function toDateInputValue(value) {
  const d = value ? new Date(value) : new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

// Plain-language stand-ins for what would otherwise be the backend's literal
// validation wording (e.g. "amount must be a positive number") — caught here
// before the request ever goes out, so the app reads like a finished product
// instead of surfacing assertion-style messages meant for a developer.
function validateForm(f) {
  if (!f.accountId) return 'Please choose an account.'
  if (!f.amount || !(Number(f.amount) > 0)) return 'Please enter a valid amount.'
  if (!f.occurredAt) return 'Please choose a date.'
  return null
}

// A non-blocking heads-up, not a validation error — a real account balance
// can legitimately go negative (overdraft, or just logging an expense
// before its matching income), so this never stops submission. It's purely
// a "double check you picked the right account" nudge, computed against the
// account's balance BEFORE this expense (any currently-selected account to
// edit already excludes its own prior amount from that balance, handled by
// the caller passing in the right "excludeAmount").
function getInsufficientBalanceWarning(f, accounts, excludeAmount = 0) {
  if (f.type !== 'expense' || !f.accountId || !f.amount) return null
  const account = accounts.find((a) => a.id === Number(f.accountId))
  if (!account) return null
  const balanceBefore = Number(account.balance) + excludeAmount
  const amount = Number(f.amount)
  if (!(amount > 0) || amount <= balanceBefore) return null
  return `This will take ${account.name}'s balance negative (${formatCurrency(balanceBefore - amount, account.currency)}).`
}

// The user can pick any start/end date, but the span between them is capped
// at one calendar month — a longer range is a "report", not a quick filter,
// and belongs on the Reports page instead.
function isWithinOneMonth(startDate, endDate) {
  const start = new Date(startDate)
  const maxEnd = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate())
  return new Date(endDate) <= maxEnd
}

const emptyForm = () => ({ accountId: '', categoryId: '', type: 'expense', amount: '', occurredAt: toDateInputValue(), notes: '' })

// Grouped by currency (via each transaction's account) rather than summed
// as one number — most users only ever see one group, but mixing two
// currencies into a single total would silently misreport the real amount.
function summarizeByCurrency(transactions, accounts) {
  const totals = {}
  for (const txn of transactions) {
    const currency = accounts.find((a) => a.id === txn.account_id)?.currency || 'IDR'
    if (!totals[currency]) totals[currency] = { income: 0, expense: 0 }
    totals[currency][txn.type] += Number(txn.amount)
  }
  return totals
}

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filterError, setFilterError] = useState('')

  const [filters, setFilters] = useState({ startDate: '', endDate: '', accountId: '', categoryId: '', type: '' })
  const [activeQuickRange, setActiveQuickRange] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')

  const [editingTxn, setEditingTxn] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editFormError, setEditFormError] = useState('')

  const [quickEditId, setQuickEditId] = useState(null)
  const [quickEditError, setQuickEditError] = useState('')

  const [deletingTxn, setDeletingTxn] = useState(null)

  const [splittingTxn, setSplittingTxn] = useState(null)
  const [splitRows, setSplitRows] = useState([])
  const [splitError, setSplitError] = useState('')

  async function loadReference() {
    const [accountsData, categoriesData] = await Promise.all([
      request('/accounts'),
      request('/categories')
    ])
    setAccounts(accountsData.accounts)
    setCategories(categoriesData.categories)
  }

  // Accepts an explicit filters object (used by the quick-range buttons,
  // which need to fetch with a range that hasn't landed in state yet) and
  // falls back to current state otherwise, so every other existing call
  // site (loadTransactions()) keeps working unchanged.
  async function loadTransactions(overrideFilters) {
    const activeFilters = overrideFilters || filters
    setFilterError('')
    if (activeFilters.startDate && activeFilters.endDate) {
      if (new Date(activeFilters.startDate) > new Date(activeFilters.endDate)) {
        setFilterError('End date must be after start date.')
        return
      }
      if (!isWithinOneMonth(activeFilters.startDate, activeFilters.endDate)) {
        setFilterError('Please select a date range of 1 month or less.')
        return
      }
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(activeFilters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })
      const data = await request(`/transactions?${params.toString()}`)
      setTransactions(data.transactions)
    } catch (err) {
      setLoadError(err.message || 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  // "30 days" is the widest a quick button can offer without exceeding the
  // 1-month cap the manual date pickers are also held to.
  function applyQuickRange(days) {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    const nextFilters = { ...filters, startDate: toDateInputValue(start), endDate: toDateInputValue(end) }
    setFilters(nextFilters)
    setActiveQuickRange(days)
    loadTransactions(nextFilters)
  }

  useEffect(() => {
    function init() {
      loadReference().catch((err) => setLoadError(err.message))
      loadTransactions()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resetForm() {
    setForm(emptyForm())
    setFormError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    const validationMessage = validateForm(form)
    if (validationMessage) { setFormError(validationMessage); return }
    try {
      const payload = {
        accountId: Number(form.accountId),
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        type: form.type,
        amount: Number(form.amount),
        occurredAt: form.occurredAt,
        notes: form.notes || undefined
      }
      await request('/transactions', { method: 'POST', body: JSON.stringify(payload) })
      resetForm()
      setShowForm(false)
      loadTransactions()
      loadReference()
    } catch (err) {
      setFormError(err.message || 'Something went wrong saving this transaction. Please try again.')
    }
  }

  function startEdit(txn) {
    setEditingTxn(txn)
    setEditForm({
      accountId: String(txn.account_id),
      categoryId: txn.category_id ? String(txn.category_id) : '',
      type: txn.type,
      amount: String(txn.amount),
      occurredAt: toDateInputValue(txn.occurred_at),
      notes: txn.notes || ''
    })
    setEditFormError('')
  }

  function closeEdit() {
    setEditingTxn(null)
    setEditForm(null)
    setEditFormError('')
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditFormError('')
    const validationMessage = validateForm(editForm)
    if (validationMessage) { setEditFormError(validationMessage); return }
    try {
      const payload = {
        accountId: Number(editForm.accountId),
        categoryId: editForm.categoryId ? Number(editForm.categoryId) : null,
        type: editForm.type,
        amount: Number(editForm.amount),
        occurredAt: editForm.occurredAt,
        // Sent as-is (even '') rather than falling back to undefined — this
        // is an edit form, so whatever's left in the field when you save is
        // the intended value, including "cleared it out on purpose". Sending
        // undefined here would drop the key from the JSON body entirely,
        // which the backend reads as "leave the old notes alone" instead of
        // "the user cleared this."
        notes: editForm.notes
      }
      await request(`/transactions/${editingTxn.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      closeEdit()
      loadTransactions()
      loadReference()
    } catch (err) {
      setEditFormError(err.message || 'Something went wrong saving these changes. Please try again.')
    }
  }

  async function handleCreateCategory(e) {
    e.preventDefault()
    setCategoryError('')
    if (!newCategoryName.trim()) { setCategoryError('Please enter a category name.'); return }
    try {
      const data = await request('/categories', { method: 'POST', body: JSON.stringify({ name: newCategoryName }) })
      setCategories((prev) => [...prev, data.category].sort((a, b) => a.name.localeCompare(b.name)))
      setForm((f) => ({ ...f, categoryId: String(data.category.id) }))
      setNewCategoryName('')
      setShowCategoryForm(false)
    } catch (err) {
      setCategoryError(err.message || 'Failed to create category')
    }
  }

  async function confirmDelete() {
    const txn = deletingTxn
    setDeletingTxn(null)
    try {
      await request(`/transactions/${txn.id}`, { method: 'DELETE' })
      loadTransactions()
      loadReference()
    } catch (err) {
      setLoadError(err.message || 'Failed to delete transaction')
    }
  }

  // Category-only shortcut: the full Edit dialog is still there for
  // anything else, but re-categorizing is the single most common fix, so
  // it doesn't need the whole form to open just for that.
  async function handleQuickCategoryChange(txn, categoryId) {
    setQuickEditError('')
    try {
      await request(`/transactions/${txn.id}`, { method: 'PATCH', body: JSON.stringify({ categoryId: Number(categoryId) }) })
      setQuickEditId(null)
      loadTransactions()
    } catch (err) {
      setQuickEditError(err.message || 'Failed to update category')
    }
  }

  // Pre-fills row 1 with the full amount under the transaction's current
  // category, and an empty row 2 for the user to carve an amount out of it —
  // editing row 1's amount down is usually faster than typing both from
  // scratch (inspired by Copilot Money's split feature).
  function startSplit(txn) {
    setSplittingTxn(txn)
    setSplitRows([
      { categoryId: txn.category_id ? String(txn.category_id) : '', amount: String(txn.amount), notes: txn.notes || '' },
      { categoryId: '', amount: '', notes: '' }
    ])
    setSplitError('')
  }

  function closeSplit() {
    setSplittingTxn(null)
    setSplitRows([])
    setSplitError('')
  }

  function updateSplitRow(index, field, value) {
    setSplitRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function addSplitRow() {
    setSplitRows((rows) => [...rows, { categoryId: '', amount: '', notes: '' }])
  }

  function removeSplitRow(index) {
    setSplitRows((rows) => rows.filter((_, i) => i !== index))
  }

  const splitTotal = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const splitOriginal = splittingTxn ? Number(splittingTxn.amount) : 0
  const splitDiff = Math.round((splitOriginal - splitTotal) * 100) / 100

  async function handleSplitSubmit(e) {
    e.preventDefault()
    setSplitError('')
    if (splitRows.length < 2) { setSplitError('A split needs at least 2 parts.'); return }
    for (const row of splitRows) {
      if (!(Number(row.amount) > 0)) { setSplitError('Please enter a valid amount for each part.'); return }
    }
    if (splitDiff !== 0) {
      setSplitError(`The parts must add up to the original total of ${formatCurrency(splitOriginal, accounts.find((a) => a.id === splittingTxn.account_id)?.currency)}.`)
      return
    }
    try {
      await request(`/transactions/${splittingTxn.id}/split`, {
        method: 'POST',
        body: JSON.stringify({
          splits: splitRows.map((r) => ({
            categoryId: r.categoryId ? Number(r.categoryId) : null,
            amount: Number(r.amount),
            notes: r.notes || undefined
          }))
        })
      })
      closeSplit()
      loadTransactions()
    } catch (err) {
      setSplitError(err.message || 'Something went wrong splitting this transaction. Please try again.')
    }
  }

  const currencyTotals = summarizeByCurrency(transactions, accounts)
  const currencies = Object.keys(currencyTotals)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Transactions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Log and review your income and expenses.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm((v) => !v) }}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md"
        >
          {showForm ? 'Cancel' : <><Plus size={15} /> New Transaction</>}
        </button>
      </div>

      {currencies.length > 0 && (
        <div className="space-y-3">
          {currencies.map((currency) => (
            <div key={currency} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard
                icon={TrendingUp}
                color="emerald"
                label={currencies.length > 1 ? `Income (${currency})` : 'Income'}
                value={formatCurrency(currencyTotals[currency].income, currency)}
                hint={currencies.length === 1 ? 'in view' : undefined}
              />
              <SummaryCard
                icon={TrendingDown}
                color="red"
                label={currencies.length > 1 ? `Expense (${currency})` : 'Expense'}
                value={formatCurrency(currencyTotals[currency].expense, currency)}
                hint={currencies.length === 1 ? 'in view' : undefined}
              />
              <SummaryCard
                icon={Scale}
                color="blue"
                label={currencies.length > 1 ? `Net (${currency})` : 'Net'}
                value={formatCurrency(currencyTotals[currency].income - currencyTotals[currency].expense, currency)}
                hint={currencies.length === 1 ? 'in view' : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader icon={ArrowLeftRight} color="emerald" title="New Transaction" />
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm">
              <option value="">Account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className="flex gap-1">
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm">
                <option value="">Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setShowCategoryForm((v) => !v)}
                title="Add a new category"
                className="shrink-0 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 transition-all duration-150 hover:scale-110 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                +
              </button>
            </div>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm capitalize">
              {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder={form.accountId ? `Amount (${accounts.find((a) => a.id === Number(form.accountId))?.currency})` : 'Amount'}
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            <input type="date" required value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm" />
            <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm" />

            {showCategoryForm && (
              <div className="col-span-full flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
                <input
                  autoFocus
                  placeholder="New category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm"
                />
                <button type="button" onClick={handleCreateCategory} className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition-all duration-150 hover:scale-105 hover:bg-emerald-100">Add</button>
                <button type="button" onClick={() => { setShowCategoryForm(false); setNewCategoryName(''); setCategoryError('') }} className="text-xs font-medium text-gray-400 dark:text-gray-500 transition-colors duration-150 hover:text-gray-600 dark:hover:text-gray-300">Cancel</button>
              </div>
            )}
            {categoryError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{categoryError}</p>}

            {!formError && getInsufficientBalanceWarning(form, accounts) && (
              <p className="col-span-full flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle size={14} className="shrink-0" /> {getInsufficientBalanceWarning(form, accounts)}
              </p>
            )}
            {formError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <button type="submit" className="col-span-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-[1.02] hover:bg-emerald-700 hover:shadow-md">
              Create
            </button>
          </form>
        </div>
      )}

      <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
        <CardHeader
          icon={SlidersHorizontal}
          color="slate"
          title="Filters"
          subtitle="Pick a date range of up to 1 month"
          action={
            <div className="flex gap-1 rounded-full bg-gray-100 dark:bg-gray-700 p-1">
              <button
                onClick={() => applyQuickRange(7)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${activeQuickRange === 7 ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                7 Days
              </button>
              <button
                onClick={() => applyQuickRange(30)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${activeQuickRange === 30 ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                30 Days
              </button>
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <input type="date" value={filters.startDate} onChange={(e) => { setFilters({ ...filters, startDate: e.target.value }); setActiveQuickRange(null) }} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm" />
          <input type="date" value={filters.endDate} onChange={(e) => { setFilters({ ...filters, endDate: e.target.value }); setActiveQuickRange(null) }} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm" />
          <select value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm">
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm">
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
            <button onClick={() => loadTransactions()} className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md">
              Filter
            </button>
          </div>
        </div>
      </div>
      {filterError && <p className="text-sm text-red-600 dark:text-red-400">{filterError}</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
      {quickEditError && <p className="text-sm text-red-600 dark:text-red-400">{quickEditError}</p>}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading transactions...</p>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white dark:bg-gray-800 py-12 text-center shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <Receipt size={28} className="text-gray-300 dark:text-gray-500" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No transactions match your filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => {
                const account = accounts.find((a) => a.id === txn.account_id)
                const isIncome = txn.type === 'income'
                return (
                  <tr key={txn.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{new Date(txn.occurred_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        isIncome ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        {isIncome ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {txn.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {quickEditId === txn.id ? (
                        <select
                          autoFocus
                          defaultValue={txn.category_id || ''}
                          onChange={(e) => handleQuickCategoryChange(txn, e.target.value)}
                          onBlur={() => setQuickEditId(null)}
                          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="" disabled>Choose category</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : txn.category_id ? (
                        <button
                          onClick={() => setQuickEditId(txn.id)}
                          title="Click to change category"
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-transform duration-150 hover:scale-105 ${categoryBadgeColor(txn.category_id, categories)}`}
                        >
                          <Tag size={11} />
                          {categories.find((c) => c.id === txn.category_id)?.name || 'Unknown'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setQuickEditId(txn.id)}
                          title="Click to set a category"
                          className="text-xs text-gray-300 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300"
                        >
                          — set category
                        </button>
                      )}
                    </td>
                    <td className={`px-4 py-3 font-medium ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {isIncome ? '+' : '-'}{formatCurrency(txn.amount, account?.currency)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{txn.notes || '-'}</td>
                    <td className="space-x-1 px-4 py-3 text-right">
                      <button onClick={() => startSplit(txn)} title="Split" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300">
                        <Split size={14} />
                      </button>
                      <button onClick={() => startEdit(txn)} title="Edit" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeletingTxn(txn)} title="Delete" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingTxn && editForm && (() => {
        // The account's stored balance already has this transaction's OLD
        // effect baked in — add it back first so the warning checks against
        // what the balance would be without it, same as a brand new expense.
        // Only applies when it's still the same account; moving to a
        // different one has no prior effect there to undo.
        const excludeAmount = editingTxn.type === 'expense' && Number(editingTxn.account_id) === Number(editForm.accountId)
          ? Number(editingTxn.amount)
          : 0
        const insufficientBalanceWarning = getInsufficientBalanceWarning(editForm, accounts, excludeAmount)
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeEdit}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Transaction</h3>
              <button onClick={closeEdit} className="text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <select required value={editForm.accountId} onChange={(e) => setEditForm({ ...editForm, accountId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm">
                <option value="">Account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm">
                <option value="">Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm capitalize">
                {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
              <input
                type="number"
                step="0.01"
                placeholder={editForm.accountId ? `Amount (${accounts.find((a) => a.id === Number(editForm.accountId))?.currency})` : 'Amount'}
                required
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm"
              />
              <input type="date" required value={editForm.occurredAt} onChange={(e) => setEditForm({ ...editForm, occurredAt: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm" />
              <input placeholder="Notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 transition-colors duration-150 hover:border-gray-400 dark:hover:border-gray-500 px-3 py-2 text-sm" />

              {!editFormError && insufficientBalanceWarning && (
                <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={14} className="shrink-0" /> {insufficientBalanceWarning}
                </p>
              )}

              {editFormError && <p className="text-sm text-red-600 dark:text-red-400">{editFormError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeEdit} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
        )
      })()}

      {splittingTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeSplit}>
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Split Transaction</h3>
              <button onClick={closeSplit} className="text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Divide this {formatCurrency(splittingTxn.amount, accounts.find((a) => a.id === splittingTxn.account_id)?.currency)} {splittingTxn.type} across multiple categories.
            </p>

            <form onSubmit={handleSplitSubmit} className="space-y-3">
              {splitRows.map((row, i) => (
                <div key={i} className="flex items-start gap-2">
                  <select
                    value={row.categoryId}
                    onChange={(e) => updateSplitRow(i, 'categoryId', e.target.value)}
                    className="w-2/5 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
                  >
                    <option value="">Category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`Amount (${accounts.find((a) => a.id === splittingTxn.account_id)?.currency})`}
                    value={row.amount}
                    onChange={(e) => updateSplitRow(i, 'amount', e.target.value)}
                    className="w-1/4 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Notes"
                    value={row.notes}
                    onChange={(e) => updateSplitRow(i, 'notes', e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeSplitRow(i)}
                    disabled={splitRows.length <= 2}
                    title="Remove part"
                    className="shrink-0 rounded-md p-2 text-gray-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addSplitRow}
                className="text-xs font-medium text-emerald-600 transition-colors duration-150 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                + Add another part
              </button>

              <p className={`text-xs font-medium ${splitDiff === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {splitDiff === 0
                  ? 'Parts add up to the full amount.'
                  : `${formatCurrency(Math.abs(splitDiff), accounts.find((a) => a.id === splittingTxn.account_id)?.currency)} ${splitDiff > 0 ? 'left to assign' : 'over the original total'}`}
              </p>

              {splitError && <p className="text-sm text-red-600 dark:text-red-400">{splitError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeSplit} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md">
                  Split
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingTxn}
        title="Delete this transaction?"
        message={deletingTxn && `This will delete the ${deletingTxn.type} of ${formatCurrency(deletingTxn.amount, accounts.find((a) => a.id === deletingTxn.account_id)?.currency)}${deletingTxn.notes ? ` (${deletingTxn.notes})` : ''} and reverse its effect on the account balance. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingTxn(null)}
      />
    </div>
  )
}
