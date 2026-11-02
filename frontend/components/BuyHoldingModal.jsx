'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatQuantity } from '@/lib/format'

const INPUT = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const SELECT_OK = 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
const SELECT_MISSING = 'animate-shake border-red-500 ring-2 ring-red-500/30 dark:border-red-400'
const OPTION = 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100'
const LABEL = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400'

function todayValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Buying more of a holding (a top-up / DCA): how many, at what price, what
// actually left the account with the broker's fee, and from which account —
// the counterpart of SellHoldingModal, laid out the same way. The new
// average price is shown before confirming.
export default function BuyHoldingModal({ holding, accounts, onClose, onBought }) {
  const held = Number(holding.quantity)
  const [form, setForm] = useState({
    quantity: '',
    price: Number(holding.currentPrice) > 0 ? String(Number(holding.currentPrice)) : '',
    totalPaid: '',
    date: todayValue(),
    accountId: ''
  })
  const [accountMissing, setAccountMissing] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const quantity = Number(form.quantity)
  const price = Number(form.price)
  const gross = quantity > 0 && price > 0 ? quantity * price : null
  const total = form.totalPaid !== '' ? Number(form.totalPaid) : gross
  const fee = gross !== null && form.totalPaid !== '' ? Number(form.totalPaid) - gross : null
  const newAverage = total !== null && held + quantity > 0 ? (Number(holding.costBasisTotal) + total) / (held + quantity) : null
  const options = accounts.filter((a) => !a.is_archived && a.currency === holding.currency)
  const accountName = options.find((a) => String(a.id) === form.accountId)?.name

  function validate() {
    if (!(quantity > 0)) return 'Enter how many units you bought.'
    if (!(price > 0)) return 'Enter the price per unit you paid.'
    if (form.totalPaid !== '' && !(Number(form.totalPaid) >= 0)) return 'The total paid can’t be negative.'
    if (fee !== null && fee < -0.01) return 'The total paid is less than quantity × price — check both.'
    if (!form.accountId) return 'Select the account the money came from.'
    return ''
  }

  async function submit() {
    const problem = validate()
    if (problem) {
      setError(problem)
      if (!form.accountId && problem.startsWith('Select')) setAccountMissing((n) => n + 1)
      return
    }
    setSaving(true)
    setError('')
    try {
      await request(`/investments/${holding.id}/add`, {
        method: 'POST',
        body: JSON.stringify({
          quantity,
          price,
          totalSpent: Math.round(total * 100) / 100,
          accountId: form.accountId === 'none' ? undefined : Number(form.accountId),
          date: form.date || undefined
        })
      })
      onBought()
    } catch (err) {
      setError(err.message || 'Could not record this purchase')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Buy {holding.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
        </div>
        <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          You hold {formatQuantity(held)}{held > 0 && <> · average cost {formatCurrency(Number(holding.costBasisTotal) / held, holding.currency)} per unit, fees included</>}.
        </p>

        <div className="space-y-3">
          <div>
            <label className={LABEL}>Quantity bought</label>
            <input type="number" step="any" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 100" className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} title="The price per unit on your trade confirmation, before fees">Price per unit ({holding.currency})</label>
              <input type="number" step="any" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className={LABEL} title="What actually left your account, fees included. Leave empty if there was no fee.">Total paid <span className="text-gray-400">· optional</span></label>
              <input type="number" step="any" min="0" value={form.totalPaid} onChange={(e) => setForm({ ...form, totalPaid: e.target.value })} placeholder={gross !== null ? String(Math.round(gross * 100) / 100) : 'incl. fees'} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Date</label>
              <input type="date" value={form.date} max={todayValue()} onChange={(e) => setForm({ ...form, date: e.target.value })} className={INPUT} />
            </div>
            <div className="min-w-0">
              <label className={LABEL} title="The total paid is taken from this account's balance">Funding account</label>
              <select
                key={`acc-${accountMissing}`}
                value={form.accountId}
                onChange={(e) => { setForm({ ...form, accountId: e.target.value }); setAccountMissing(0); setError('') }}
                className={`w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100 ${accountMissing && !form.accountId ? SELECT_MISSING : SELECT_OK}`}
              >
                <option value="" disabled className={OPTION}>Select account</option>
                {options.map((a) => <option key={a.id} value={a.id} className={OPTION}>{a.name}</option>)}
                <option value="none" className={OPTION}>Other (not tracked in this app)</option>
              </select>
            </div>
          </div>
        </div>

        {total !== null && gross !== null && (
          <div className="mt-4 space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-900/40">
            <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>{formatQuantity(quantity)} × {formatCurrency(price, holding.currency)}</span><span>{formatCurrency(gross, holding.currency)}</span></div>
            {fee !== null && fee > 0.005 && <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Fee</span><span>{formatCurrency(fee, holding.currency)}</span></div>}
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold dark:border-gray-700">
              <span className="text-gray-700 dark:text-gray-300">Total paid{accountName ? ` from ${accountName}` : ''}</span>
              <span className="text-gray-900 dark:text-gray-100">{formatCurrency(total, holding.currency)}</span>
            </div>
            {newAverage !== null && <p className="pt-1 text-xs text-gray-500 dark:text-gray-400">New average cost: {formatCurrency(newAverage, holding.currency)} per unit</p>}
          </div>
        )}

        {error && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Buying…' : 'Buy'}
          </button>
        </div>
      </div>
    </div>
  )
}
