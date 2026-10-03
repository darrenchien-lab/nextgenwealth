'use client'

import { useEffect, useRef, useState } from 'react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'
import CardHeader from '@/components/CardHeader'
import ConfirmDialog from '@/components/ConfirmDialog'
import SummaryCard from '@/components/SummaryCard'
import {
  Plus, Wallet, Landmark, Smartphone, Banknote, CreditCard,
  Archive, ArchiveRestore, Trash2, ArrowLeftRight, Undo2, X
} from 'lucide-react'

const ACCOUNT_TYPES = ['bank', 'e_wallet', 'cash', 'credit_card']
const ACCOUNT_TYPE_ICONS = { bank: Landmark, e_wallet: Smartphone, cash: Banknote, credit_card: CreditCard }
const ACCOUNT_TYPE_LABELS = { bank: 'Bank', e_wallet: 'E-Wallet', cash: 'Cash', credit_card: 'Credit Card' }

// Plain-language stand-ins for the backend's literal validation wording,
// caught here before the request goes out (same reasoning as Transactions).
function validateAccountForm(f) {
  if (!f.name.trim()) return 'Please enter an account name.'
  if (!f.currency.trim() || f.currency.trim().length !== 3) return 'Please enter a valid 3-letter currency code (e.g. IDR, USD).'
  if (f.balance !== '' && Number.isNaN(Number(f.balance))) return 'Please enter a valid starting balance.'
  return null
}

function validateTransferForm(f) {
  if (!f.fromAccountId) return 'Please choose a source account.'
  if (!f.toAccountId) return 'Please choose a destination account.'
  if (f.fromAccountId === f.toAccountId) return 'Please choose two different accounts.'
  if (!f.amount || !(Number(f.amount) > 0)) return 'Please enter a valid amount.'
  if (f.toAmount && !(Number(f.toAmount) > 0)) return 'Please enter a valid received amount.'
  return null
}

// Archived accounts are excluded — this is "what do I actually have right
// now", not a historical total.
function summarizeBalances(accounts) {
  const totals = {}
  for (const a of accounts) {
    if (a.is_archived) continue
    totals[a.currency] = (totals[a.currency] || 0) + Number(a.balance)
  }
  return totals
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'bank', currency: 'IDR', balance: '0' })
  const [formError, setFormError] = useState('')
  const [currencies, setCurrencies] = useState([])
  const [actionError, setActionError] = useState('')
  const [editingBalanceId, setEditingBalanceId] = useState(null)
  const [balanceInput, setBalanceInput] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(null)

  const [transfers, setTransfers] = useState([])
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [showAllTransfers, setShowAllTransfers] = useState(false)
  const [transferForm, setTransferForm] = useState({ fromAccountId: '', toAccountId: '', amount: '', toAmount: '', notes: '' })
  const [transferError, setTransferError] = useState('')
  const [reversingTransfer, setReversingTransfer] = useState(null)

  // The Transfers card should never grow the page taller than the Accounts
  // card next to it — since Accounts' height already varies with how many
  // accounts exist, that's a moving target CSS alone can't cap Transfers to.
  // Measuring it live and capping Transfers' own height to match keeps them
  // visually balanced regardless of how many transfers there are (the list
  // scrolls internally past that point instead of pushing the card taller).
  const accountsCardRef = useRef(null)
  const [accountsCardHeight, setAccountsCardHeight] = useState(null)

  useEffect(() => {
    const el = accountsCardRef.current
    if (!el) return
    // offsetHeight (border-box, includes this card's own padding/border) —
    // not entry.contentRect.height, which excludes them and would end up a
    // padding's-worth short once applied as the OTHER card's max-height.
    const observer = new ResizeObserver(() => setAccountsCardHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  async function loadAccounts() {
    setLoading(true)
    try {
      const data = await request('/accounts?includeArchived=true')
      setAccounts(data.accounts)
    } catch (err) {
      setLoadError(err.message || 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  async function loadTransfers() {
    try {
      const data = await request('/transfers')
      setTransfers(data.transfers)
    } catch (err) {
      setActionError(err.message || 'Failed to load transfers')
    }
  }

  async function loadCurrencies() {
    try {
      const data = await request('/accounts/supported-currencies')
      setCurrencies(data.currencies)
    } catch {
      // Falls back to a plain text field's default if this fails to load.
    }
  }

  useEffect(() => {
    function init() {
      loadAccounts()
      loadTransfers()
      loadCurrencies()
    }
    init()
  }, [])

  const visibleAccounts = showArchived ? accounts : accounts.filter((a) => !a.is_archived)
  const balanceTotals = summarizeBalances(accounts)
  const balanceCurrencies = Object.keys(balanceTotals)

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    const validationMessage = validateAccountForm(form)
    if (validationMessage) { setFormError(validationMessage); return }
    try {
      await request('/accounts', {
        method: 'POST',
        body: JSON.stringify({ ...form, currency: form.currency.toUpperCase(), balance: Number(form.balance || 0) })
      })
      setForm({ name: '', type: 'bank', currency: 'IDR', balance: '0' })
      setShowForm(false)
      loadAccounts()
    } catch (err) {
      setFormError(err.message || 'Something went wrong creating this account. Please try again.')
    }
  }

  async function handleArchive(id) {
    setActionError('')
    try {
      await request(`/accounts/${id}/archive`, { method: 'POST' })
      loadAccounts()
    } catch (err) {
      setActionError(err.message || 'Failed to archive account')
    }
  }

  async function handleUnarchive(id) {
    setActionError('')
    try {
      await request(`/accounts/${id}/unarchive`, { method: 'POST' })
      loadAccounts()
    } catch (err) {
      setActionError(err.message || 'Failed to unarchive account')
    }
  }

  function startEditBalance(account) {
    setEditingBalanceId(account.id)
    setBalanceInput(String(account.balance))
  }

  async function handleSaveBalance(account) {
    setActionError('')
    const newBalance = Number(balanceInput)
    if (Number.isNaN(newBalance)) {
      setActionError('Please enter a valid balance.')
      return
    }
    const delta = newBalance - Number(account.balance)
    try {
      if (delta !== 0) {
        await request(`/accounts/${account.id}/adjust`, { method: 'PATCH', body: JSON.stringify({ delta }) })
        loadAccounts()
      }
      setEditingBalanceId(null)
    } catch (err) {
      setActionError(err.message || 'Failed to update balance')
    }
  }

  async function confirmDeleteAccount() {
    const account = deletingAccount
    setDeletingAccount(null)
    setActionError('')
    try {
      await request(`/accounts/${account.id}`, { method: 'DELETE' })
      loadAccounts()
    } catch (err) {
      setActionError(err.message || 'Failed to delete account')
    }
  }

  async function handleCreateTransfer(e) {
    e.preventDefault()
    setTransferError('')
    const validationMessage = validateTransferForm(transferForm)
    if (validationMessage) { setTransferError(validationMessage); return }
    try {
      await request('/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromAccountId: Number(transferForm.fromAccountId),
          toAccountId: Number(transferForm.toAccountId),
          amount: Number(transferForm.amount),
          toAmount: transferForm.toAmount ? Number(transferForm.toAmount) : undefined,
          notes: transferForm.notes || undefined
        })
      })
      setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', toAmount: '', notes: '' })
      setShowTransferForm(false)
      loadAccounts()
      loadTransfers()
    } catch (err) {
      setTransferError(err.message || 'Something went wrong creating this transfer. Please try again.')
    }
  }

  async function confirmReverseTransfer() {
    const t = reversingTransfer
    setReversingTransfer(null)
    setActionError('')
    try {
      await request(`/transfers/${t.id}/reverse`, { method: 'POST' })
      loadAccounts()
      loadTransfers()
    } catch (err) {
      setActionError(err.message || 'Failed to reverse transfer')
    }
  }

  function accountName(id) {
    return accounts.find((a) => a.id === id)?.name || `#${id}`
  }

  function transferRow(t) {
    const fromCurrency = accounts.find((a) => a.id === t.from_account_id)?.currency
    const toCurrency = accounts.find((a) => a.id === t.to_account_id)?.currency
    const isReversal = !!t.reverses_transfer_id
    // Only ever true once, since reverseTransfer refuses to reverse a
    // transfer twice — but re-derived from the list rather than trusted
    // as a stored flag, so it can't go stale if this list is re-fetched.
    const isReversed = transfers.some((other) => other.reverses_transfer_id === t.id)
    return (
      <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60">
        <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{new Date(t.occurred_at).toLocaleDateString()}</td>
        <td className="px-5 py-3 text-gray-900 dark:text-gray-100">
          {accountName(t.from_account_id)}
          {/* Only ever set for transfers made after this feature shipped — older
              ones never had their post-transfer balance recorded, so there's
              nothing truthful to show for them (not "0" or today's balance). */}
          {t.from_balance_after !== null && t.from_balance_after !== undefined && (
            <p className="text-xs text-gray-400 dark:text-gray-500">Balance after: {formatCurrency(t.from_balance_after, fromCurrency)}</p>
          )}
        </td>
        <td className="px-5 py-3 text-gray-900 dark:text-gray-100">
          {accountName(t.to_account_id)}
          {t.to_balance_after !== null && t.to_balance_after !== undefined && (
            <p className="text-xs text-gray-400 dark:text-gray-500">Balance after: {formatCurrency(t.to_balance_after, toCurrency)}</p>
          )}
        </td>
        <td className="px-5 py-3 text-gray-900 dark:text-gray-100">
          {formatCurrency(t.from_amount, fromCurrency)}
          {Number(t.from_amount) !== Number(t.to_amount) && (
            <span className="text-gray-400 dark:text-gray-500"> → {formatCurrency(t.to_amount, toCurrency)}</span>
          )}
        </td>
        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
          {isReversal && <span className="mr-1.5 rounded-full bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">Reversal</span>}
          {isReversed && <span className="mr-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">Reversed</span>}
          {t.notes || (!isReversal && '-')}
        </td>
        <td className="px-5 py-3 text-right">
          {/* Reversing a reversal, or reversing something already reversed,
              would need its own untangling logic the backend deliberately
              doesn't support (reverseTransfer rejects both) — hidden here
              to match rather than show a button that always errors. */}
          {!isReversal && !isReversed && (
            <button onClick={() => setReversingTransfer(t)} title="Reverse" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 dark:hover:text-amber-400">
              <Undo2 size={17} />
            </button>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Accounts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage your accounts and move money between them.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => { setShowTransferForm(true); setTransferError('') }}
            title="Move money between your own accounts"
            className="flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-violet-700 hover:shadow-md"
          >
            <ArrowLeftRight size={15} /> Transfer
          </button>
          <button
            onClick={() => { setShowForm((v) => !v); setFormError('') }}
            className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md"
          >
            {showForm ? 'Cancel' : <><Plus size={15} /> New Account</>}
          </button>
        </div>
      </div>

      {balanceCurrencies.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {balanceCurrencies.map((currency) => (
            <SummaryCard
              key={currency}
              icon={Wallet}
              color="blue"
              label={balanceCurrencies.length > 1 ? `Total Balance (${currency})` : 'Total Balance'}
              value={formatCurrency(balanceTotals[currency], currency)}
              hint="active accounts"
            />
          ))}
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader icon={Wallet} color="blue" title="New Account" />
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              placeholder="Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select
              required
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            >
              <option value="">Currency</option>
              {currencies.length === 0
                ? <option value="IDR">IDR</option>
                : currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="number"
              placeholder="Initial balance"
              value={form.balance}
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            {form.type === 'credit_card' && (
              <p className="col-span-full text-xs text-gray-500 dark:text-gray-400">
                Enter what you currently owe as a negative number (e.g. -500000). Spending on the card makes it more negative; paying it off with a transfer brings it back toward 0.
              </p>
            )}
            {formError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <button type="submit" className="col-span-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-[1.02] hover:bg-emerald-700 hover:shadow-md">
              Create
            </button>
          </form>
        </div>
      )}

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div ref={accountsCardRef} className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 lg:col-span-2">
        <CardHeader
          icon={Landmark}
          color="slate"
          title="Your Accounts"
          action={
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="cursor-pointer" />
              Show archived
            </label>
          }
        />
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading accounts...</p>
        ) : visibleAccounts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Wallet size={28} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {showArchived ? 'No accounts yet.' : 'No active accounts. Create one, or check "Show archived".'}
            </p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Balance</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((account) => {
                  const TypeIcon = ACCOUNT_TYPE_ICONS[account.type] || Wallet
                  return (
                    <tr key={account.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60">
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{account.name}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                          <TypeIcon size={14} />
                          {ACCOUNT_TYPE_LABELS[account.type] || account.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-900 dark:text-gray-100">
                        {editingBalanceId === account.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              autoFocus
                              value={balanceInput}
                              onChange={(e) => setBalanceInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveBalance(account); if (e.key === 'Escape') setEditingBalanceId(null) }}
                              className="w-28 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                            />
                            <button onClick={() => handleSaveBalance(account)} className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition-all duration-150 hover:scale-105 hover:bg-emerald-100">Save</button>
                            <button onClick={() => setEditingBalanceId(null)} className="text-xs font-medium text-gray-400 dark:text-gray-500 transition-colors duration-150 hover:text-gray-600 dark:hover:text-gray-300">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => startEditBalance(account)} className="rounded transition-colors duration-150 hover:text-emerald-600 dark:hover:text-emerald-400" title="Click to edit balance">
                            {formatCurrency(account.balance, account.currency)}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {account.is_archived ? (
                          <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Archived</span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400">Active</span>
                        )}
                      </td>
                      <td className="space-x-1 px-5 py-3 text-right">
                        {account.is_archived ? (
                          <button onClick={() => handleUnarchive(account.id)} title="Unarchive" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400">
                            <ArchiveRestore size={17} />
                          </button>
                        ) : (
                          <button onClick={() => handleArchive(account.id)} title="Archive" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300">
                            <Archive size={17} />
                          </button>
                        )}
                        <button onClick={() => setDeletingAccount(account)} title="Delete" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400">
                          <Trash2 size={17} />
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
        className="flex flex-col rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700"
        style={accountsCardHeight ? { maxHeight: accountsCardHeight } : undefined}
      >
        <CardHeader
          icon={ArrowLeftRight}
          color="violet"
          title="Transfers"
          action={
            transfers.length > 0 && (
              <button onClick={() => setShowAllTransfers(true)} className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">
                View all
              </button>
            )
          }
        />

        {transfers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <ArrowLeftRight size={24} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400 dark:text-gray-500">No transfers yet.</p>
          </div>
        ) : (
          // Capped to the Accounts card's live-measured height (see
          // accountsCardHeight above) instead of growing the page taller —
          // past that, it scrolls internally. "View all" still opens the
          // full table for browsing/deleting an older one comfortably.
          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {transfers.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-500">
                    <ArrowLeftRight size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {accountName(t.from_account_id)} → {accountName(t.to_account_id)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(t.occurred_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrency(t.from_amount, accounts.find((a) => a.id === t.from_account_id)?.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>

      {showTransferForm && (() => {
        const fromAcc = accounts.find((a) => a.id === Number(transferForm.fromAccountId))
        const toAcc = accounts.find((a) => a.id === Number(transferForm.toAccountId))
        const crossCurrency = fromAcc && toAcc && fromAcc.currency !== toAcc.currency
        const closeTransferForm = () => { setShowTransferForm(false); setTransferError('') }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeTransferForm}>
            <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">New Transfer</h3>
                <button onClick={closeTransferForm} className="text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-600 dark:hover:text-gray-300">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreateTransfer} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  required
                  value={transferForm.fromAccountId}
                  onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })}
                  className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
                >
                  <option value="">From account</option>
                  {accounts.filter((a) => !a.is_archived).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
                <select
                  required
                  value={transferForm.toAccountId}
                  onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}
                  className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
                >
                  <option value="">To account</option>
                  {accounts.filter((a) => !a.is_archived).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder={fromAcc ? `Amount (${fromAcc.currency})` : 'Amount'}
                  required
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                  className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Notes (optional)"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
                />

                {crossCurrency && (
                  <div className="col-span-full">
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`Received amount (${toAcc.currency})`}
                      value={transferForm.toAmount}
                      onChange={(e) => setTransferForm({ ...transferForm, toAmount: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Leave blank to auto-convert using today&apos;s exchange rate, or enter the exact amount you actually received (e.g. from your bank/money changer&apos;s own rate).
                    </p>
                  </div>
                )}

                {transferError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{transferError}</p>}
                <div className="col-span-full flex justify-end gap-2 pt-2">
                  <button type="button" onClick={closeTransferForm} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-700">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-violet-700 hover:shadow-md">
                    Transfer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}

      {showAllTransfers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAllTransfers(false)}>
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">All Transfers ({transfers.length})</h3>
              <button onClick={() => setShowAllTransfers(false)} className="text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">From</th>
                    <th className="px-5 py-3">To</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Notes</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map(transferRow)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingAccount}
        title="Delete this account?"
        message={deletingAccount && `This permanently deletes "${deletingAccount.name}". Only accounts with no transaction history can be deleted — if this fails, archive it instead.`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeletingAccount(null)}
      />

      <ConfirmDialog
        open={!!reversingTransfer}
        title="Reverse this transfer?"
        message={reversingTransfer && `This adds a new offsetting transfer of ${formatCurrency(reversingTransfer.from_amount, accounts.find((a) => a.id === reversingTransfer.from_account_id)?.currency)} between ${accountName(reversingTransfer.from_account_id)} and ${accountName(reversingTransfer.to_account_id)}, restoring both balances. The original transfer stays in your history — nothing is deleted.`}
        confirmLabel="Reverse"
        onConfirm={confirmReverseTransfer}
        onCancel={() => setReversingTransfer(null)}
      />
    </div>
  )
}
