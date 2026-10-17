'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Target, Plus, Pencil, Trash2, X, Landmark, TrendingUp, Link2, HandCoins, CheckCircle2, AlertTriangle, Clock, CalendarX } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'
import { todayInputValue } from '@/lib/dates'
import ConfirmDialog from '@/components/ConfirmDialog'

const INPUT = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

const formatMonth = (dateKey) => new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

const STATUS = {
  complete: { label: 'Reached', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  on_track: { label: 'On track', icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  behind: { label: 'Behind', icon: AlertTriangle, className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  overdue: { label: 'Past target date', icon: CalendarX, className: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  unknown: { label: 'Not enough history yet', icon: Clock, className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  no_date: null
}

const emptyForm = () => ({ name: '', targetAmount: '', targetDate: '', currency: '', mode: 'linked', sources: {} })

// One line under the progress bar that says what to do next, in plain words.
function planSentence(goal) {
  const { plan, currency } = goal
  if (plan.status === 'complete') return 'Target reached — nice work.'
  const parts = []
  if (plan.neededPerMonth) parts.push(`Save ${formatCurrency(plan.neededPerMonth, currency)}/month to reach it by ${formatMonth(goal.target_date.slice(0, 10))}.`)
  if (plan.pacePerMonth !== null) {
    if (plan.pacePerMonth > 0) {
      parts.push(`Lately you've added ${formatCurrency(plan.pacePerMonth, currency)}/month${plan.projectedDate ? ` — at this pace you'll get there around ${formatMonth(plan.projectedDate)}` : ''}.`)
    } else {
      parts.push("It hasn't grown over the last few months.")
    }
  }
  if (plan.status === 'overdue') parts.unshift(`${formatCurrency(plan.remaining, currency)} still to go.`)
  if (parts.length === 0) return goal.mode === 'linked' ? 'Updates on its own as these balances change.' : 'Record money as you set it aside.'
  return parts.join(' ')
}

function GoalCard({ goal, onEdit, onDelete, onMoveMoney }) {
  const status = STATUS[goal.plan.status]
  const StatusIcon = status?.icon
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayInputValue())

  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold text-gray-900 dark:text-gray-100">{goal.name}</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {goal.target_date ? `Target date ${formatMonth(goal.target_date.slice(0, 10))}` : 'No target date'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => onEdit(goal)} title="Edit goal" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"><Pencil size={15} /></button>
          <button onClick={() => onDelete(goal)} title="Delete goal" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(goal.saved_amount, goal.currency)}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">of {formatCurrency(goal.target_amount, goal.currency)}</p>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div className={`h-full rounded-full ${goal.isComplete ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, goal.progressPercentage)}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{goal.progressPercentage}%</span>
        {status && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
            <StatusIcon size={12} /> {status.label}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{planSentence(goal)}</p>

      <div className="mt-auto pt-4">
        {goal.mode === 'linked' ? (
          <div className="flex flex-wrap gap-1.5">
            {goal.sources.map((s) => (
              <span key={`${s.type}${s.id}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300" title={s.amount ? `Counts up to ${formatCurrency(s.amount, goal.currency)}` : 'Counts in full'}>
                {s.type === 'account' ? <Landmark size={11} /> : <TrendingUp size={11} />}
                {s.name}{s.amount ? ` · up to ${formatCurrency(s.amount, goal.currency)}` : ''}
              </span>
            ))}
          </div>
        ) : (
          <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-gray-700">
            <p className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500"><HandCoins size={12} /> Tracked by hand — record money you set aside or take back</p>
            <div className="flex gap-2">
              <input type="number" step="any" min="0" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${INPUT} min-w-0 py-1.5`} />
              <input type="date" title="When the money was set aside or taken back" value={date} max={todayInputValue()} onChange={(e) => setDate(e.target.value)} className={`${INPUT} w-36 py-1.5`} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => onMoveMoney(goal, 'contribute', amount, date).then((ok) => ok && setAmount(''))} className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Add</button>
              <button onClick={() => onMoveMoney(goal, 'withdraw', amount, date).then((ok) => ok && setAmount(''))} className="flex-1 rounded-lg bg-gray-100 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">Take back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([])
  const [accounts, setAccounts] = useState([])
  const [holdings, setHoldings] = useState([])
  const [suggestions, setSuggestions] = useState(null)
  const [displayCurrency, setDisplayCurrency] = useState('IDR')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')

  const [editingGoal, setEditingGoal] = useState(null) // null = closed, {} = new goal
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingGoal, setDeletingGoal] = useState(null)

  async function loadGoals() {
    try {
      const data = await request('/goals')
      setGoals(data.goals)
    } catch (err) {
      setLoadError(err.message || 'Failed to load goals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    function init() {
      loadGoals()
      request('/accounts').then((d) => setAccounts(d.accounts)).catch(() => {})
      request('/investments/portfolio').then((d) => { setHoldings(d.holdings); setDisplayCurrency(d.displayCurrency || 'IDR') }).catch(() => {})
      request('/goals/suggestions').then(setSuggestions).catch(() => {})
    }
    init()
  }, [])

  const currencyOptions = Array.from(new Set([displayCurrency, ...accounts.map((a) => a.currency)]))

  function openNew() {
    setForm({ ...emptyForm(), currency: displayCurrency })
    setFormError('')
    setEditingGoal({})
  }

  function openEdit(goal) {
    const sources = {}
    for (const s of goal.sources) sources[`${s.type}:${s.id}`] = { amount: s.amount ? String(s.amount) : '' }
    setForm({
      name: goal.name,
      targetAmount: String(Number(goal.target_amount)),
      targetDate: goal.target_date ? goal.target_date.slice(0, 10) : '',
      currency: goal.currency,
      mode: goal.mode,
      sources
    })
    setFormError('')
    setEditingGoal(goal)
  }

  function toggleSource(key) {
    setForm((f) => {
      const sources = { ...f.sources }
      if (sources[key]) delete sources[key]
      else sources[key] = { amount: '' }
      return { ...f, sources }
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) return setFormError('Give the goal a name.')
    if (!(Number(form.targetAmount) > 0)) return setFormError('Enter a target amount above zero.')
    const sources = form.mode === 'linked'
      ? Object.entries(form.sources).map(([key, s]) => {
        const [type, id] = key.split(':')
        return { type, id: Number(id), amount: s.amount === '' ? null : Number(s.amount) }
      })
      : []
    if (form.mode === 'linked' && sources.length === 0) return setFormError('Pick at least one account or holding, or choose "Track by hand".')

    const body = { name: form.name.trim(), targetAmount: Number(form.targetAmount), targetDate: form.targetDate || null, currency: form.currency, sources }
    setSaving(true)
    try {
      if (editingGoal.id) await request(`/goals/${editingGoal.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      else await request('/goals', { method: 'POST', body: JSON.stringify(body) })
      setEditingGoal(null)
      loadGoals()
    } catch (err) {
      setFormError(err.message || 'Failed to save goal')
    } finally {
      setSaving(false)
    }
  }

  async function handleMoveMoney(goal, action, amount, date) {
    setActionError('')
    if (!(Number(amount) > 0)) {
      setActionError(`Enter an amount for "${goal.name}" first.`)
      return false
    }
    try {
      await request(`/goals/${goal.id}/${action}`, { method: 'POST', body: JSON.stringify({ amount: Number(amount), date: date || undefined }) })
      loadGoals()
      return true
    } catch (err) {
      setActionError(err.message || 'Failed to update goal')
      return false
    }
  }

  async function confirmDelete() {
    const goal = deletingGoal
    setDeletingGoal(null)
    try {
      await request(`/goals/${goal.id}`, { method: 'DELETE' })
      loadGoals()
    } catch (err) {
      setActionError(err.message || 'Failed to delete goal')
    }
  }

  const emergencyTarget = suggestions?.averageMonthlyExpense ? Math.round(suggestions.averageMonthlyExpense * 6) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Goals</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Save toward a target. Link a goal to where its money is kept and it updates on its own.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
          <Plus size={16} /> New goal
        </button>
      </div>

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading goals...</p>
      ) : goals.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
          <Target size={32} className="mx-auto text-emerald-500" />
          <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Set your first goal</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
            For example an emergency fund, a home down payment or a new laptop. Link it to the account or investment where you keep that money, and you&apos;ll see how much to save each month and whether you&apos;re on track.
          </p>
          <button onClick={openNew} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            <Plus size={16} /> New goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onEdit={openEdit} onDelete={setDeletingGoal} onMoveMoney={handleMoveMoney} />
          ))}
        </div>
      )}

      <p className="border-t border-gray-100 pt-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Investment allocation targets are set on the{' '}
        <Link href="/reports" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Reports</Link>{' '}
        page, in the Target vs Actual Allocation card.
      </p>

      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingGoal(null)}>
          <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()} className="max-h-[calc(100vh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{editingGoal.id ? 'Edit goal' : 'New goal'}</h2>
              <button type="button" onClick={() => setEditingGoal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>

            <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emergency fund" className={`${INPUT} mt-1 normal-case`} />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Target amount
                <input type="number" step="any" min="0" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} className={`${INPUT} mt-1`} />
              </label>
              <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Currency
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={`${INPUT} mt-1`}>
                  {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            {emergencyTarget && (
              <button
                type="button"
                onClick={() => setForm({ ...form, targetAmount: String(emergencyTarget), currency: suggestions.displayCurrency })}
                className="-mt-2 text-left text-xs text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Emergency fund? Use 6 months of your spending: {formatCurrency(emergencyTarget, suggestions.displayCurrency)}
                <span className="text-gray-400 dark:text-gray-500"> (average {formatCurrency(suggestions.averageMonthlyExpense, suggestions.displayCurrency)}/cycle over the last {suggestions.cyclesCounted})</span>
              </button>
            )}

            <label className="block text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Target date <span className="normal-case text-gray-400">(optional — needed to know how much to save each month)</span>
              <input type="date" min={todayInputValue()} value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} className={`${INPUT} mt-1`} />
            </label>

            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">How to track progress</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {[['linked', Link2, 'From my accounts', 'Follows balances automatically'], ['manual', HandCoins, 'By hand', 'You record what you set aside']].map(([mode, Icon, title, hint]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setForm({ ...form, mode })}
                    className={`rounded-lg border p-2.5 text-left ${form.mode === mode ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-900/20' : 'border-gray-200 hover:border-gray-300 dark:border-gray-600'}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100"><Icon size={14} /> {title}</span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {form.mode === 'linked' && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Tick where this goal&apos;s money is kept. If an account also holds other money, enter how much of it is for this goal.
                </p>
                {[
                  ...accounts.map((a) => ({ key: `account:${a.id}`, icon: Landmark, name: a.name, detail: formatCurrency(a.balance, a.currency) })),
                  ...holdings.map((h) => ({ key: `holding:${h.id}`, icon: TrendingUp, name: h.asset_name, detail: h.currentValue !== null ? formatCurrency(h.currentValue, displayCurrency) : h.currency }))
                ].map(({ key, icon: Icon, name, detail }) => {
                  const selected = form.sources[key]
                  return (
                    <div key={key} className={`rounded-lg border px-3 py-2 ${selected ? 'border-emerald-500 dark:border-emerald-400' : 'border-gray-200 dark:border-gray-600'}`}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!selected} onChange={() => toggleSource(key)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
                        <Icon size={14} className="text-gray-400" />
                        <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{name}</span>
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{detail}</span>
                      </label>
                      {selected && (
                        <input
                          type="number" step="any" min="0"
                          placeholder={`Use all of it, or only up to… (${form.currency})`}
                          value={selected.amount}
                          onChange={(e) => setForm((f) => ({ ...f, sources: { ...f.sources, [key]: { amount: e.target.value } } }))}
                          className={`${INPUT} mt-2 py-1.5 text-xs`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingGoal(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? 'Saving…' : editingGoal.id ? 'Save changes' : 'Create goal'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingGoal}
        title={deletingGoal ? `Delete "${deletingGoal.name}"?` : ''}
        message="The goal and its history are removed. Your accounts and investments aren't touched."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingGoal(null)}
      />
    </div>
  )
}
