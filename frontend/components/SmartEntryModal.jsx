'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowLeftRight, ArrowDownRight, ArrowUpRight, CheckCircle2, Loader2, Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { todayInputValue } from '@/lib/dates'

const INPUT = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const OPTION = 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100'
const LABEL = 'mb-1 block text-[11px] font-medium text-gray-500 dark:text-gray-400'

const KIND_STYLE = {
  transaction: { label: 'Transaction', icon: ArrowDownRight },
  transfer: { label: 'Transfer', icon: ArrowLeftRight },
  buy: { label: 'Buy', icon: TrendingUp },
  sell: { label: 'Sell', icon: TrendingDown }
}

// What still stops a row from being saved, in words; '' when it is ready.
function problemWith(d, context) {
  if (d.kind === 'transaction') {
    if (!(Number(d.amount) > 0)) return 'Enter the amount.'
    if (!d.accountId) return 'Choose an account.'
  } else if (d.kind === 'transfer') {
    if (!(Number(d.amount) > 0)) return 'Enter the amount.'
    if (!d.fromAccountId || !d.toAccountId) return 'Choose both accounts.'
    if (String(d.fromAccountId) === String(d.toAccountId)) return 'Choose two different accounts.'
  } else {
    if (d.kind === 'buy' && !d.holdingId && !d.assetName.trim()) return 'Enter the asset name.'
    if (d.kind === 'sell' && !d.holdingId) return 'Choose the holding to sell.'
    if (!(Number(d.quantity) > 0)) return 'Enter the quantity.'
    if (!(Number(d.price) > 0) && !(Number(d.total) > 0)) return 'Enter the price.'
    // A new holding is only linked to an account in the same currency, so a mismatch must be fixed, not skipped quietly.
    const account = context.accounts.find((a) => String(a.id) === String(d.accountId))
    if (d.kind === 'buy' && !d.holdingId && account && account.currency !== d.currency) {
      return `That account is in ${account.currency}. Change the currency to ${account.currency}, or choose no account.`
    }
  }
  return ''
}

// The same endpoints the normal forms use, so every existing rule still applies.
async function saveDraft(d, context) {
  const num = (v) => Number(v)
  if (d.kind === 'transaction') {
    return request('/transactions', { method: 'POST', body: JSON.stringify({
      accountId: num(d.accountId), categoryId: d.categoryId ? num(d.categoryId) : null, type: d.type,
      amount: num(d.amount), occurredAt: d.date, notes: d.notes.trim() || undefined
    }) })
  }
  if (d.kind === 'transfer') {
    return request('/transfers', { method: 'POST', body: JSON.stringify({
      fromAccountId: num(d.fromAccountId), toAccountId: num(d.toAccountId), amount: num(d.amount),
      occurredAt: d.date, notes: d.notes.trim() || undefined
    }) })
  }
  const quantity = num(d.quantity)
  const price = Number(d.price) > 0 ? num(d.price) : num(d.total) / quantity
  const total = Number(d.total) > 0 ? num(d.total) : Math.round(quantity * price * 100) / 100
  const account = context.accounts.find((a) => String(a.id) === String(d.accountId))
  if (d.kind === 'buy' && !d.holdingId) {
    const sameCurrency = account && account.currency === d.currency
    return request('/investments', { method: 'POST', body: JSON.stringify({
      assetName: d.assetName.trim(), assetType: d.assetType, quantity, currency: d.currency,
      totalSpent: total, price, accountId: sameCurrency ? account.id : undefined, purchasedAt: d.date
    }) })
  }
  if (d.kind === 'buy') {
    return request(`/investments/${d.holdingId}/add`, { method: 'POST', body: JSON.stringify({
      quantity, price, totalSpent: total, accountId: account ? account.id : undefined, date: d.date
    }) })
  }
  return request(`/investments/${d.holdingId}/remove`, { method: 'POST', body: JSON.stringify({
    quantity, price, totalReceived: Number(d.total) > 0 ? num(d.total) : undefined, accountId: account ? account.id : undefined, date: d.date
  }) })
}

function Field({ label, children, className = '' }) {
  return <div className={className}><label className={LABEL}>{label}</label>{children}</div>
}

function AccountSelect({ value, onChange, accounts, optional = false }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={INPUT}>
      <option value="" className={OPTION}>{optional ? 'No account' : 'Choose…'}</option>
      {accounts.map((a) => <option key={a.id} value={a.id} className={OPTION}>{a.name} ({a.currency})</option>)}
    </select>
  )
}

function DraftRow({ draft, context, status, onChange, onRemove }) {
  const { label, icon: Icon } = KIND_STYLE[draft.kind]
  const problem = problemWith(draft, context)
  const set = (patch) => onChange({ ...draft, ...patch })
  const saved = status?.state === 'saved'
  const kindIcon = draft.kind === 'transaction' ? (draft.type === 'income' ? ArrowUpRight : ArrowDownRight) : Icon
  const KindIcon = kindIcon

  return (
    <li className={`rounded-xl p-3 ring-1 ${saved ? 'bg-emerald-50 ring-emerald-100 dark:bg-emerald-900/20 dark:ring-emerald-800/40' : 'bg-gray-50 ring-gray-100 dark:bg-gray-900/40 dark:ring-gray-700'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          <KindIcon size={14} /> {draft.kind === 'transaction' ? (draft.type === 'income' ? 'Income' : 'Expense') : label}
        </span>
        {saved ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} /> Saved</span>
        ) : (
          <button onClick={onRemove} aria-label="Remove this entry" className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"><X size={14} /></button>
        )}
      </div>

      {!saved && (
        <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {draft.kind === 'transaction' && (
            <>
              <Field label="Type">
                <select value={draft.type} onChange={(e) => set({ type: e.target.value })} className={INPUT}>
                  <option value="expense" className={OPTION}>Expense</option>
                  <option value="income" className={OPTION}>Income</option>
                </select>
              </Field>
              <Field label="Amount"><input type="number" min="0" step="any" value={draft.amount ?? ''} onChange={(e) => set({ amount: e.target.value })} className={INPUT} /></Field>
              <Field label="Account"><AccountSelect value={draft.accountId} onChange={(v) => set({ accountId: v })} accounts={context.accounts} /></Field>
              <Field label="Category">
                <select value={draft.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value })} className={INPUT}>
                  <option value="" className={OPTION}>None</option>
                  {context.categories.map((c) => <option key={c.id} value={c.id} className={OPTION}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Note" className="col-span-2"><input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT} /></Field>
            </>
          )}
          {draft.kind === 'transfer' && (
            <>
              <Field label="Amount"><input type="number" min="0" step="any" value={draft.amount ?? ''} onChange={(e) => set({ amount: e.target.value })} className={INPUT} /></Field>
              <Field label="From"><AccountSelect value={draft.fromAccountId} onChange={(v) => set({ fromAccountId: v })} accounts={context.accounts} /></Field>
              <Field label="To"><AccountSelect value={draft.toAccountId} onChange={(v) => set({ toAccountId: v })} accounts={context.accounts} /></Field>
              <Field label="Note"><input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT} /></Field>
            </>
          )}
          {(draft.kind === 'buy' || draft.kind === 'sell') && (
            <>
              <Field label={draft.holdingId || draft.kind === 'sell' ? 'Holding' : 'Asset name'} className="col-span-2">
                {draft.holdingId || draft.kind === 'sell' ? (
                  <select value={draft.holdingId ?? ''} onChange={(e) => set({ holdingId: e.target.value ? Number(e.target.value) : null })} className={INPUT}>
                    <option value="" className={OPTION}>Choose…</option>
                    {context.holdings.map((h) => <option key={h.id} value={h.id} className={OPTION}>{h.name}</option>)}
                  </select>
                ) : (
                  <input value={draft.assetName} onChange={(e) => set({ assetName: e.target.value })} className={INPUT} />
                )}
              </Field>
              <Field label="Quantity"><input type="number" min="0" step="any" value={draft.quantity ?? ''} onChange={(e) => set({ quantity: e.target.value, total: '' })} className={INPUT} /></Field>
              <Field label="Price per unit"><input type="number" min="0" step="any" value={draft.price ?? ''} onChange={(e) => set({ price: e.target.value, total: '' })} className={INPUT} /></Field>
              <Field label={draft.kind === 'buy' ? 'Account paid from' : 'Paid into'} className="col-span-2">
                <AccountSelect value={draft.accountId} onChange={(v) => set({ accountId: v })} accounts={context.accounts} optional />
              </Field>
              {draft.kind === 'buy' && !draft.holdingId && (
                <Field label="Currency"><input value={draft.currency} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} className={INPUT} /></Field>
              )}
            </>
          )}
          <Field label="Date"><input type="date" max={todayInputValue()} value={draft.date} onChange={(e) => set({ date: e.target.value })} className={INPUT} /></Field>
        </fieldset>
      )}

      {!saved && draft.issues.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {draft.issues.map((issue) => (
            <li key={issue} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {issue}</li>
          ))}
        </ul>
      )}
      {!saved && problem && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{problem}</p>}
      {status?.state === 'error' && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{status.message}</p>}
    </li>
  )
}

// Write what you did in your own words, check the entries it understood, then
// save them. Nothing is saved until you press the button.
export default function SmartEntryModal({ onClose, onSaved }) {
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState(null)
  const [context, setContext] = useState(null)
  const [statuses, setStatuses] = useState({})
  const [saving, setSaving] = useState(false)

  async function read() {
    setError('')
    setReading(true)
    try {
      const result = await request('/smart-entry/parse', { method: 'POST', body: JSON.stringify({ text }) })
      setContext(result.context)
      setDrafts(result.drafts.map((d) => ({ ...d, notes: d.notes ?? '', accountId: d.accountId ?? '', categoryId: d.categoryId ?? '', fromAccountId: d.fromAccountId ?? '', toAccountId: d.toAccountId ?? '' })))
      setStatuses({})
      if (result.drafts.length === 0) setError("We couldn't find anything to record in that. Try something like \"lunch 45k\" or \"salary 8M\".")
    } catch (err) {
      setError(err.message || "We couldn't read that. Please try again.")
    } finally {
      setReading(false)
    }
  }

  async function saveAll() {
    setSaving(true)
    const next = { ...statuses }
    for (const d of drafts) {
      if (next[d.id]?.state === 'saved') continue
      try {
        await saveDraft(d, context)
        next[d.id] = { state: 'saved' }
      } catch (err) {
        next[d.id] = { state: 'error', message: err.message || "This one couldn't be saved. Please try again." }
      }
      setStatuses({ ...next })
    }
    setSaving(false)
    if (drafts.every((d) => next[d.id]?.state === 'saved')) onSaved()
  }

  const pending = drafts ? drafts.filter((d) => statuses[d.id]?.state !== 'saved') : []
  const anyProblem = pending.some((d) => problemWith(d, context))
  const anySaved = drafts ? drafts.some((d) => statuses[d.id]?.state === 'saved') : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={saving ? undefined : (anySaved ? onSaved : onClose)}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100"><Sparkles size={16} className="text-emerald-600 dark:text-emerald-400" /> Quick add</h3>
          <button onClick={anySaved ? onSaved : onClose} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"><X size={18} /></button>
        </div>

        {!drafts ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">Tell us what happened, in your own words. You can mention several things at once, and you&apos;ll review everything before it&apos;s saved.</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder={'For example: lunch 45k from my e-wallet, salary 8M into my bank account, bought 10 lots of BBCA at 9,200'}
              autoFocus
              className={`${INPUT} resize-none`}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">Your message and the names of your accounts and categories are read by an AI model that runs on our own server so it can understand them. Your balances are never shared.</p>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={read} disabled={reading || !text.trim()} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                {reading && <Loader2 size={14} className="animate-spin" />} {reading ? 'Understanding…' : 'Continue'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {drafts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">Here&apos;s what we understood. Fix anything that looks off, then save.</p>
                <ul className="space-y-2.5">
                  {drafts.map((d) => (
                    <DraftRow
                      key={d.id}
                      draft={d}
                      context={context}
                      status={statuses[d.id]}
                      onChange={(next) => setDrafts((list) => list.map((x) => (x.id === d.id ? next : x)))}
                      onRemove={() => setDrafts((list) => list.filter((x) => x.id !== d.id))}
                    />
                  ))}
                </ul>
              </>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button onClick={() => { setDrafts(null); setError('') }} disabled={saving || anySaved} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700">Back</button>
              {pending.length > 0 && (
                <button onClick={saveAll} disabled={saving || anyProblem} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />} {saving ? 'Saving…' : `Save ${pending.length} ${pending.length === 1 ? 'entry' : 'entries'}`}
                </button>
              )}
              {pending.length === 0 && drafts.length > 0 && <button onClick={onSaved} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Done</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
