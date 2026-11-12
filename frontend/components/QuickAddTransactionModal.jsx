'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, X } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'

const LAST_ACCOUNT_KEY = 'nextgen-last-account'
const INPUT = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const OPTION = 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100'
const LABEL = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400'

const todayValue = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The account used last time, if it's still there.
const rememberedAccount = (accounts) => {
  try {
    const saved = window.localStorage.getItem(LAST_ACCOUNT_KEY)
    if (saved && accounts.some((a) => String(a.id) === saved)) return saved
  } catch {
    // Storage blocked: fall back to the first account.
  }
  return accounts[0] ? String(accounts[0].id) : ''
}

// A small form to record an expense or income without leaving the page it's
// opened from. Less common options (counting it in the next cycle, splitting,
// receipts) are on the Transactions page, one link away.
export default function QuickAddTransactionModal({ accounts, categories, onClose, onSaved }) {
  const open = accounts.filter((a) => !a.is_archived)
  const [form, setForm] = useState(() => ({ type: 'expense', amount: '', accountId: rememberedAccount(open), categoryId: '', occurredAt: todayValue(), notes: '' }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const account = open.find((a) => String(a.id) === form.accountId)
  const amount = Number(form.amount)
  const goesNegative = form.type === 'expense' && account && amount > 0 && amount > Number(account.balance)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!(amount > 0)) return setError('Enter the amount.')
    if (!account) return setError('Choose an account.')
    setSaving(true)
    try {
      await request('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          accountId: account.id,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          type: form.type,
          amount,
          occurredAt: form.occurredAt,
          notes: form.notes.trim() || undefined
        })
      })
      try {
        window.localStorage.setItem(LAST_ACCOUNT_KEY, String(account.id))
      } catch {
        // Not remembering the account is only a convenience lost.
      }
      onSaved()
    } catch (err) {
      setError(err.message || 'Could not save this transaction')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add transaction</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
        </div>

        {open.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">You need an account before you can record a transaction.</p>
            <Link href="/accounts" className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">Add an account</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900/60" role="radiogroup" aria-label="Type">
              {[['expense', ArrowDownRight, 'Expense', 'text-red-600 dark:text-red-400'], ['income', ArrowUpRight, 'Income', 'text-emerald-600 dark:text-emerald-400']].map(([key, Icon, label, tone]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={form.type === key}
                  onClick={() => setForm({ ...form, type: key })}
                  className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors duration-150 ${form.type === key ? `bg-white shadow-sm dark:bg-gray-700 ${tone}` : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            <div>
              <label className={LABEL}>Amount{account ? ` (${account.currency})` : ''}</label>
              <input type="number" step="any" min="0" autoFocus value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className={`${INPUT} text-lg font-semibold`} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className={LABEL}>Account</label>
                <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className={INPUT}>
                  {open.map((a) => <option key={a.id} value={a.id} className={OPTION}>{a.name}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label className={LABEL}>Category <span className="text-gray-400">· optional</span></label>
                <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={INPUT}>
                  <option value="" className={OPTION}>No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id} className={OPTION}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {goesNegative && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                <AlertTriangle size={14} className="mt-px shrink-0" />
                This takes {account.name}&apos;s balance negative ({formatCurrency(Number(account.balance) - amount, account.currency)}).
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Date</label>
                <input type="date" value={form.occurredAt} max={todayValue()} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Note <span className="text-gray-400">· optional</span></label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Lunch" maxLength={200} className={INPUT} />
              </div>
            </div>

            {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex items-center justify-between gap-3 pt-1">
              <Link href="/transactions" className="text-xs font-medium text-gray-500 hover:text-emerald-600 hover:underline dark:text-gray-400 dark:hover:text-emerald-400">More options</Link>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
