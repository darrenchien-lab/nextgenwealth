'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'
import CardHeader from '@/components/CardHeader'
import ConfirmDialog from '@/components/ConfirmDialog'
import SummaryCard from '@/components/SummaryCard'
import { Plus, Receipt, CheckCircle, Pencil, XCircle, X, AlertTriangle } from 'lucide-react'

const emptyForm = () => ({ name: '', amount: '', dueDate: '', accountId: '', categoryId: '', notes: '' })

// Plain-language stand-ins for the backend's literal validation wording,
// caught here before the request goes out (same reasoning as Transactions).
function validateBillForm(f) {
  if (!f.name.trim()) return 'Please enter a bill name.'
  if (!f.amount || !(Number(f.amount) > 0)) return 'Please enter a valid amount.'
  if (!f.dueDate) return 'Please choose a due date.'
  return null
}

// Grouped by currency (via each bill's linked account) rather than summed as
// one number — mixing currencies into a single total would misreport it.
// Bills with no linked account have no known currency yet, so they're
// counted separately and flagged instead of guessed at.
function summarizeDue(bills, accounts) {
  const totals = {}
  let unlinkedCount = 0
  for (const bill of bills) {
    if (bill.status === 'paid' || bill.status === 'cancelled') continue
    const account = accounts.find((a) => a.id === bill.account_id)
    if (!account) { unlinkedCount += 1; continue }
    totals[account.currency] = (totals[account.currency] || 0) + Number(bill.amount)
  }
  return { totals, unlinkedCount }
}

export default function BillsPage() {
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')

  const [editingBill, setEditingBill] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editFormError, setEditFormError] = useState('')

  const [payingBill, setPayingBill] = useState(null)
  const [cancellingBillId, setCancellingBillId] = useState(null)

  async function loadAll(all = showAll) {
    setLoading(true)
    try {
      const [accountsData, categoriesData, billsData] = await Promise.all([
        request('/accounts'),
        request('/categories'),
        request(all ? '/bills' : '/bills/upcoming')
      ])
      setAccounts(accountsData.accounts)
      setCategories(categoriesData.categories)
      setBills(billsData.bills)
    } catch (err) {
      setLoadError(err.message || 'Failed to load bills')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    function init() {
      loadAll(showAll)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll])

  function resetForm() {
    setForm(emptyForm())
    setFormError('')
  }

  function startEdit(bill) {
    setEditingBill(bill)
    setEditForm({
      name: bill.name,
      amount: String(bill.amount),
      dueDate: bill.due_date.slice(0, 10),
      accountId: bill.account_id ? String(bill.account_id) : '',
      categoryId: bill.category_id ? String(bill.category_id) : '',
      notes: bill.notes || ''
    })
    setEditFormError('')
  }

  function closeEdit() {
    setEditingBill(null)
    setEditForm(null)
    setEditFormError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    const validationMessage = validateBillForm(form)
    if (validationMessage) { setFormError(validationMessage); return }
    try {
      await request('/bills', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          amount: Number(form.amount),
          dueDate: form.dueDate,
          accountId: form.accountId ? Number(form.accountId) : null,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          notes: form.notes || undefined
        })
      })
      resetForm()
      setShowForm(false)
      loadAll()
    } catch (err) {
      setFormError(err.message || 'Something went wrong saving this bill. Please try again.')
    }
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditFormError('')
    const validationMessage = validateBillForm(editForm)
    if (validationMessage) { setEditFormError(validationMessage); return }
    try {
      await request(`/bills/${editingBill.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          amount: Number(editForm.amount),
          dueDate: editForm.dueDate,
          accountId: editForm.accountId ? Number(editForm.accountId) : null,
          categoryId: editForm.categoryId ? Number(editForm.categoryId) : null,
          // Sent as-is (even '') rather than undefined, same reasoning as the
          // Transactions edit form — this is an edit form, so a cleared field
          // means "clear it", not "leave the old value alone".
          notes: editForm.notes
        })
      })
      closeEdit()
      loadAll()
    } catch (err) {
      setEditFormError(err.message || 'Something went wrong saving these changes. Please try again.')
    }
  }

  async function confirmPay() {
    const bill = payingBill
    setPayingBill(null)
    setActionError('')
    try {
      await request(`/bills/${bill.id}/pay`, { method: 'POST' })
      loadAll()
    } catch (err) {
      setActionError(err.message || 'Failed to mark bill as paid')
    }
  }

  async function confirmCancel() {
    const id = cancellingBillId
    setCancellingBillId(null)
    setActionError('')
    try {
      await request(`/bills/${id}/cancel`, { method: 'POST' })
      loadAll()
    } catch (err) {
      setActionError(err.message || 'Failed to cancel bill')
    }
  }

  const { totals: dueTotals, unlinkedCount } = summarizeDue(bills, accounts)
  const dueCurrencies = Object.keys(dueTotals)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Bills</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track what you owe and when it&apos;s due.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm((v) => !v) }}
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-105 hover:bg-emerald-700 hover:shadow-md"
        >
          {showForm ? 'Cancel' : <><Plus size={15} /> New Bill</>}
        </button>
      </div>

      {(dueCurrencies.length > 0 || unlinkedCount > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {dueCurrencies.map((currency) => (
            <SummaryCard
              key={currency}
              icon={Receipt}
              color="red"
              label={dueCurrencies.length > 1 ? `Total Due (${currency})` : 'Total Due'}
              value={formatCurrency(dueTotals[currency], currency)}
              hint="unpaid bills"
            />
          ))}
          {unlinkedCount > 0 && (
            <SummaryCard
              icon={AlertTriangle}
              color="amber"
              label="Needs an account"
              value={`${unlinkedCount} bill${unlinkedCount === 1 ? '' : 's'}`}
              hint="can't be paid yet"
            />
          )}
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <CardHeader icon={Receipt} color="red" title="New Bill" />
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
            <input
              type="number"
              placeholder={form.accountId ? `Amount (${accounts.find((a) => a.id === Number(form.accountId))?.currency})` : 'Amount'}
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            <input type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm" />
            <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm">
              <option value="">Account (needed to Pay)</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm">
              <option value="">Category (optional)</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="col-span-full rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors duration-150 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 px-3 py-2 text-sm"
            />
            {formError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <button type="submit" className="col-span-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:scale-[1.02] hover:bg-emerald-700 hover:shadow-md">
              Create
            </button>
          </form>
        </div>
      )}

      <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
        <CardHeader
          icon={Receipt}
          color="slate"
          title="Your Bills"
          action={
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="cursor-pointer" />
              Show all (not just upcoming)
            </label>
          }
        />

        {actionError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{actionError}</p>}
        {loadError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{loadError}</p>}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading bills...</p>
        ) : bills.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Receipt size={28} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400 dark:text-gray-500">{showAll ? 'No bills yet.' : 'No upcoming bills.'}</p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Account</th>
                  <th className="px-5 py-3">Due date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {bill.name}
                      {bill.notes && <p className="text-xs font-normal text-gray-400 dark:text-gray-500">{bill.notes}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-900 dark:text-gray-100">{formatCurrency(bill.amount, accounts.find((a) => a.id === bill.account_id)?.currency)}</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                      {bill.account_id
                        ? (accounts.find((a) => a.id === bill.account_id)?.name || `#${bill.account_id}`)
                        : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" title="No account linked — this bill can't be paid until you edit it and pick one">
                            <AlertTriangle size={12} /> No account
                          </span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{new Date(bill.due_date).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      {bill.status === 'paid' ? (
                        <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400">Paid</span>
                      ) : bill.status === 'cancelled' ? (
                        <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Cancelled</span>
                      ) : bill.isOverdue ? (
                        <span className="rounded-full bg-red-50 dark:bg-red-900/30 px-2 py-1 text-xs text-red-600 dark:text-red-400">Overdue</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">Pending</span>
                      )}
                    </td>
                    <td className="space-x-1 px-5 py-3 text-right">
                      {bill.status !== 'paid' && bill.status !== 'cancelled' && (
                        <>
                          <button onClick={() => setPayingBill(bill)} title="Mark as paid" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400">
                            <CheckCircle size={17} />
                          </button>
                          <button onClick={() => startEdit(bill)} title="Edit" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300">
                            <Pencil size={17} />
                          </button>
                          <button onClick={() => setCancellingBillId(bill.id)} title="Cancel bill" className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400">
                            <XCircle size={17} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingBill && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeEdit}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Bill</h3>
              <button onClick={closeEdit} className="text-gray-400 dark:text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <input placeholder="Name" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
              <input type="number" placeholder="Amount" required value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
              <input type="date" required value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
              <select value={editForm.accountId} onChange={(e) => setEditForm({ ...editForm, accountId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm">
                <option value="">Account (needed to Pay)</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
              <select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm">
                <option value="">Category (optional)</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder="Notes (optional)" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />

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
        open={!!payingBill}
        title="Mark this bill as paid?"
        message={payingBill && `This will record a ${formatCurrency(payingBill.amount, accounts.find((a) => a.id === payingBill.account_id)?.currency)} expense and deduct it from ${accounts.find((a) => a.id === payingBill.account_id)?.name || 'the linked account'}. This can't be undone from here.`}
        confirmLabel="Mark as paid"
        danger={false}
        onConfirm={confirmPay}
        onCancel={() => setPayingBill(null)}
      />

      <ConfirmDialog
        open={!!cancellingBillId}
        title="Cancel this bill?"
        message="This stops any future reminders for it (and its recurrence, if it repeats). It won't be marked as paid or deleted — you'll still see it in the full bill list."
        confirmLabel="Cancel bill"
        onConfirm={confirmCancel}
        onCancel={() => setCancellingBillId(null)}
      />
    </div>
  )
}
