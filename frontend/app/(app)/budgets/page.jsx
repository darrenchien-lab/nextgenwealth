'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Pencil, Trash2, X } from 'lucide-react'

// Plain-language stand-ins for the backend's literal validation wording,
// same reasoning as the other pages' client-side validation.
function validateBudgetForm(f) {
  if (!f.categoryId) return 'Please choose a category.'
  if (!f.period) return 'Please choose a month.'
  if (!f.limitAmount || !(Number(f.limitAmount) > 0)) return 'Please enter a valid limit amount.'
  if (!f.currency.trim() || f.currency.trim().length !== 3) return 'Please enter a valid 3-letter currency code (e.g. IDR, USD).'
  return null
}

export default function BudgetsPage() {
  const [categories, setCategories] = useState([])
  const [budgets, setBudgets] = useState([])
  const [currencies, setCurrencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  // The current budget cycle comes from the server, which knows the user's
  // cycle start day — with a cutoff like the 10th, "now" can still belong to
  // last month's cycle, so the calendar month alone would be wrong.
  const [cycle, setCycle] = useState({ period: '', periodLabel: '' })
  const [form, setForm] = useState({ categoryId: '', period: '', limitAmount: '', currency: 'IDR' })
  const [formError, setFormError] = useState('')
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')

  const [editingBudget, setEditingBudget] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editFormError, setEditFormError] = useState('')

  const [deletingBudget, setDeletingBudget] = useState(null)
  const [actionError, setActionError] = useState('')

  async function loadAll() {
    setLoading(true)
    try {
      const [categoriesData, budgetsData, currencyData, supportedData] = await Promise.all([
        request('/categories'),
        request('/budgets'),
        request('/accounts/display-currency'),
        request('/accounts/supported-currencies')
      ])
      setCategories(categoriesData.categories)
      setBudgets(budgetsData.budgets)
      setCycle({ period: budgetsData.period, periodLabel: budgetsData.periodLabel })
      setCurrencies(supportedData.currencies)
      // Just a sensible starting point for the create form — the user can
      // still pick any other currency from the dropdown, independent of
      // this setting.
      setForm((f) => ({ ...f, period: f.period || budgetsData.period, currency: currencyData.displayCurrency }))
    } catch (err) {
      setLoadError(err.message || 'Failed to load budgets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    function init() {
      loadAll()
    }
    init()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    // A name typed in the new-category box counts as the chosen category.
    const pendingCategory = showCategoryForm ? newCategoryName.trim() : ''
    const validationError = validateBudgetForm(pendingCategory ? { ...form, categoryId: 'new' } : form)
    if (validationError) { setFormError(validationError); return }
    let categoryId = form.categoryId
    if (pendingCategory) {
      setCategoryError('')
      try {
        categoryId = String((await addCategory(pendingCategory)).id)
      } catch (err) {
        setCategoryError(err.message || 'Failed to create category')
        return
      }
    }
    try {
      await request('/budgets', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: Number(categoryId),
          period: form.period,
          limitAmount: Number(form.limitAmount),
          currency: form.currency.toUpperCase()
        })
      })
      setForm((f) => ({ categoryId: '', period: cycle.period, limitAmount: '', currency: f.currency }))
      setShowForm(false)
      loadAll()
    } catch (err) {
      setFormError(err.message || 'Failed to create budget')
    }
  }

  // Creates a category, adds it to the dropdown and selects it — shared by
  // the inline "Add" button and the main form's submit, so a name typed in
  // the new-category box is saved even if "Add" was never clicked.
  async function addCategory(name) {
    const data = await request('/categories', { method: 'POST', body: JSON.stringify({ name }) })
    setCategories((prev) => [...prev, data.category].sort((a, b) => a.name.localeCompare(b.name)))
    setForm((f) => ({ ...f, categoryId: String(data.category.id) }))
    setNewCategoryName('')
    setShowCategoryForm(false)
    return data.category
  }

  async function handleCreateCategory(e) {
    e.preventDefault()
    setCategoryError('')
    if (!newCategoryName.trim()) { setCategoryError('Please enter a category name.'); return }
    try {
      await addCategory(newCategoryName.trim())
    } catch (err) {
      setCategoryError(err.message || 'Failed to create category')
    }
  }

  function startEdit(budget) {
    setEditingBudget(budget)
    setEditForm({ categoryId: String(budget.category_id), period: budget.period, limitAmount: String(budget.limit_amount), currency: budget.currency })
    setEditFormError('')
  }

  function closeEdit() {
    setEditingBudget(null)
    setEditForm(null)
    setEditFormError('')
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditFormError('')
    const validationError = validateBudgetForm(editForm)
    if (validationError) { setEditFormError(validationError); return }
    try {
      await request(`/budgets/${editingBudget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          categoryId: Number(editForm.categoryId),
          period: editForm.period,
          limitAmount: Number(editForm.limitAmount),
          currency: editForm.currency.toUpperCase()
        })
      })
      closeEdit()
      loadAll()
    } catch (err) {
      setEditFormError(err.message || 'Failed to update budget')
    }
  }

  async function confirmDelete() {
    setActionError('')
    try {
      await request(`/budgets/${deletingBudget.id}`, { method: 'DELETE' })
      setDeletingBudget(null)
      loadAll()
    } catch (err) {
      setActionError(err.message || 'Failed to delete budget')
      setDeletingBudget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Budgets</h1>
          {cycle.periodLabel && <p className="text-sm text-gray-500 dark:text-gray-400">Current cycle: {cycle.periodLabel}</p>}
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md">
          {showForm ? 'Cancel' : '+ New Budget'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 sm:grid-cols-4">
          <div className="flex gap-1">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm">
              <option value="">Category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowCategoryForm((v) => !v)}
              title="Add a new category"
              className="shrink-0 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 text-sm text-gray-600 dark:text-gray-400 transition-all duration-150 hover:scale-110 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              +
            </button>
          </div>
          <input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
          <input type="number" placeholder="Limit amount" value={form.limitAmount} onChange={(e) => setForm({ ...form, limitAmount: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
          <select
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
          >
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {showCategoryForm && (
            <div className="col-span-full flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
              <input
                autoFocus
                placeholder="New category name"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory(e) }}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
              />
              <button type="button" onClick={handleCreateCategory} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-all duration-150 hover:scale-105 hover:bg-emerald-700">Add</button>
              <button type="button" onClick={() => { setShowCategoryForm(false); setNewCategoryName(''); setCategoryError('') }} className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Cancel</button>
            </div>
          )}
          {categoryError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{categoryError}</p>}

          {formError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <button type="submit" className="col-span-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition-all duration-150 hover:scale-[1.02] hover:bg-emerald-700 hover:shadow-md">Create</button>
        </form>
      )}

      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading budgets...</p>
      ) : budgets.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No budgets for this period yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const category = categories.find((c) => c.id === budget.category_id)
            const pct = Math.min(100, Math.round((budget.spent / Number(budget.limit_amount)) * 100))
            return (
              <div key={budget.id} className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{category?.name || 'Category'}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {budget.isOverLimit && <span className="rounded-full bg-red-50 dark:bg-red-900/30 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">Over limit</span>}
                    <button onClick={() => startEdit(budget)} title="Edit" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => setDeletingBudget(budget)} title="Delete" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className={`h-2 ${budget.isOverLimit ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {formatCurrency(budget.spent, budget.displayCurrency)} of {formatCurrency(budget.limit_amount, budget.displayCurrency)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {editingBudget && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeEdit}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Budget</h3>
              <button onClick={closeEdit} className="text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm">
                <option value="">Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="month" value={editForm.period} onChange={(e) => setEditForm({ ...editForm, period: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <input type="number" placeholder="Limit amount" value={editForm.limitAmount} onChange={(e) => setEditForm({ ...editForm, limitAmount: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
                <select
                  value={editForm.currency}
                  onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  className="w-28 shrink-0 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
                >
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

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
      )}

      <ConfirmDialog
        open={!!deletingBudget}
        title="Delete this budget?"
        message={deletingBudget && `This removes the ${deletingBudget.period} budget for "${categories.find((c) => c.id === deletingBudget.category_id)?.name || 'this category'}". This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingBudget(null)}
      />
    </div>
  )
}
