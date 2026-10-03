'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'

export default function GoalsPage() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [amounts, setAmounts] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', targetAmount: '', targetDate: '' })
  const [formError, setFormError] = useState('')

  const [allocation, setAllocation] = useState(null)
  const [allocationLoading, setAllocationLoading] = useState(true)
  const [allocationError, setAllocationError] = useState('')
  const [showAllocationForm, setShowAllocationForm] = useState(false)
  const [showAllocationDetail, setShowAllocationDetail] = useState(false)
  const [targetRows, setTargetRows] = useState([{ assetName: '', targetPercentage: '' }])
  const [targetCagrInput, setTargetCagrInput] = useState('')
  const [allocationSaveError, setAllocationSaveError] = useState('')

  async function loadGoals() {
    setLoading(true)
    try {
      const data = await request('/goals')
      setGoals(data.goals)
    } catch (err) {
      setLoadError(err.message || 'Failed to load goals')
    } finally {
      setLoading(false)
    }
  }

  async function loadAllocation() {
    setAllocationLoading(true)
    try {
      const data = await request('/investments/allocation-targets')
      setAllocation(data)
      if (data.comparison.length > 0) {
        setTargetRows(data.comparison.map((c) => ({ assetName: c.assetName, targetPercentage: String(c.targetPercentage) })))
      }
      setTargetCagrInput(data.targetCagr !== null ? String(data.targetCagr) : '')
    } catch (err) {
      setAllocationError(err.message || 'Failed to load allocation targets')
    } finally {
      setAllocationLoading(false)
    }
  }

  useEffect(() => {
    function init() {
      loadGoals()
      loadAllocation()
    }
    init()
  }, [])

  function updateTargetRow(index, field, value) {
    setTargetRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function addTargetRow() {
    setTargetRows((rows) => [...rows, { assetName: '', targetPercentage: '' }])
  }

  function removeTargetRow(index) {
    setTargetRows((rows) => rows.filter((_, i) => i !== index))
  }

  async function handleSaveAllocation(e) {
    e.preventDefault()
    setAllocationSaveError('')
    try {
      const targets = targetRows
        .filter((r) => r.assetName.trim() !== '')
        .map((r) => ({ assetName: r.assetName.trim(), targetPercentage: Number(r.targetPercentage) }))
      const data = await request('/investments/allocation-targets', {
        method: 'PUT',
        body: JSON.stringify({ targets, targetCagr: targetCagrInput === '' ? null : Number(targetCagrInput) })
      })
      setAllocation(data)
      setShowAllocationForm(false)
    } catch (err) {
      setAllocationSaveError(err.message || 'Failed to save allocation targets')
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    try {
      await request('/goals', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          targetAmount: Number(form.targetAmount),
          targetDate: form.targetDate || null
        })
      })
      setForm({ name: '', targetAmount: '', targetDate: '' })
      setShowForm(false)
      loadGoals()
    } catch (err) {
      setFormError(err.message || 'Failed to create goal')
    }
  }

  async function handleContribute(id) {
    setActionError('')
    try {
      await request(`/goals/${id}/contribute`, { method: 'POST', body: JSON.stringify({ amount: Number(amounts[id] || 0) }) })
      loadGoals()
    } catch (err) {
      setActionError(err.message || 'Failed to contribute')
    }
  }

  async function handleWithdraw(id) {
    setActionError('')
    try {
      await request(`/goals/${id}/withdraw`, { method: 'POST', body: JSON.stringify({ amount: Number(amounts[id] || 0) }) })
      loadGoals()
    } catch (err) {
      setActionError(err.message || 'Failed to withdraw')
    }
  }

  async function handleDeleteGoal(id, name) {
    setActionError('')
    if (!window.confirm(`Delete the goal "${name}"? This can't be undone.`)) return
    try {
      await request(`/goals/${id}`, { method: 'DELETE' })
      loadGoals()
    } catch (err) {
      setActionError(err.message || 'Failed to delete goal')
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Goals</h1>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Savings Goals</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Save toward a specific amount by a target date.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          {showForm ? 'Cancel' : '+ New Goal'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 sm:grid-cols-3">
          <input placeholder="Goal name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
          <input type="number" placeholder="Target amount" required value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
          <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm" />
          {formError && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <button type="submit" className="col-span-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700">Create</button>
        </form>
      )}

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading goals...</p>
      ) : goals.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No savings goals yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <div key={goal.id} className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-gray-100">{goal.name}</span>
                <div className="flex items-center gap-2">
                  {goal.isComplete && <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">Complete</span>}
                  <button onClick={() => handleDeleteGoal(goal.id, goal.name)} className="text-xs font-medium text-red-500 hover:text-red-700 dark:hover:text-red-400">
                    Delete
                  </button>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div className="h-2 bg-emerald-500" style={{ width: `${Math.min(100, goal.progressPercentage)}%` }} />
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {formatCurrency(goal.saved_amount, goal.currency)} of {formatCurrency(goal.target_amount, goal.currency)} ({goal.progressPercentage}%)
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  placeholder="Amount"
                  value={amounts[goal.id] || ''}
                  onChange={(e) => setAmounts({ ...amounts, [goal.id]: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
                />
                <button onClick={() => handleContribute(goal.id)} className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                  Add
                </button>
                <button onClick={() => handleWithdraw(goal.id)} className="whitespace-nowrap rounded-lg bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500">
                  Withdraw
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Target Allocation</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Set a target % of your portfolio for each category, and see how it compares to actual.</p>
        </div>
        <button onClick={() => setShowAllocationForm((v) => !v)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          {showAllocationForm ? 'Cancel' : allocation?.comparison?.length ? 'Edit Targets' : '+ Set Targets'}
        </button>
      </div>

      {showAllocationForm && (
        <form onSubmit={handleSaveAllocation} className="space-y-3 rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          {targetRows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                placeholder="Category"
                title="e.g. Equity Indonesia"
                value={row.assetName}
                onChange={(e) => updateTargetRow(i, 'assetName', e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Target %"
                value={row.targetPercentage}
                onChange={(e) => updateTargetRow(i, 'targetPercentage', e.target.value)}
                className="w-28 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
              />
              <button type="button" onClick={() => removeTargetRow(i)} className="text-xs font-medium text-red-500 hover:text-red-700 dark:hover:text-red-400">
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addTargetRow} className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-800">
            + Add category
          </button>
          <div className="flex items-center gap-2 pt-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">Target CAGR (%)</label>
            <input
              type="number"
              step="0.01"
              value={targetCagrInput}
              onChange={(e) => setTargetCagrInput(e.target.value)}
              className="w-28 rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
            />
          </div>
          {allocationSaveError && <p className="text-sm text-red-600 dark:text-red-400">{allocationSaveError}</p>}
          <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Save Targets
          </button>
        </form>
      )}

      {allocationError && <p className="text-sm text-red-600 dark:text-red-400">{allocationError}</p>}
      {allocationLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading allocation...</p>
      ) : allocation && allocation.comparison.length > 0 ? (
        <div className="max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Portfolio Allocation</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{allocation.comparison.length} categor{allocation.comparison.length === 1 ? 'y' : 'ies'} tracked</p>
            </div>
            <button
              onClick={() => setShowAllocationDetail((v) => !v)}
              className="whitespace-nowrap text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-800"
            >
              {showAllocationDetail ? 'Hide Detail' : 'Show Detail'}
            </button>
          </div>

          {(allocation.targetCagr !== null || allocation.actualCagr) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              {allocation.targetCagr !== null && (
                <span>Target CAGR: <span className="font-semibold text-gray-900 dark:text-gray-100">{allocation.targetCagr}%</span></span>
              )}
              {allocation.actualCagr?.available ? (
                <span title={`Based on ${allocation.actualCagr.yearsElapsed} years since the cost-basis-weighted average purchase date (${allocation.actualCagr.effectiveStartDate})${allocation.actualCagr.excludedCount > 0 ? `; ${allocation.actualCagr.excludedCount} holding(s) excluded for having no purchase date set` : ''}`}>
                  Actual CAGR: <span className={`font-semibold ${allocation.actualCagr.cagr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{allocation.actualCagr.cagr}%</span>
                </span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500" title={allocation.actualCagr?.reason}>Actual CAGR unavailable</span>
              )}
            </div>
          )}

          {showAllocationDetail && (
            <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
              <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
                Actual % is each category&apos;s share of your total net worth ({formatCurrency(allocation.netWorth, allocation.displayCurrency)}) — the same total shown in the Asset Allocation chart. A target can match an account by type (e.g. &quot;Bank&quot;) or a holding&apos;s category, so several holdings (e.g. BBCA and BBRI) can count toward one target (e.g. &quot;Equity Indonesia&quot;).
              </p>
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-5 py-2">Category</th>
                      <th className="px-3 py-2">Target %</th>
                      <th className="px-3 py-2">Actual %</th>
                      <th className="px-3 py-2">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.comparison.map((c) => {
                      const diff = Math.round((c.actualPercentage - c.targetPercentage) * 10) / 10
                      return (
                        <tr key={c.assetName} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-5 py-2 font-medium text-gray-900 dark:text-gray-100">{c.assetName}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.targetPercentage}%</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{c.actualPercentage}%</td>
                          <td className={`px-3 py-2 font-medium ${Math.abs(diff) < 2 ? 'text-gray-500 dark:text-gray-400' : diff > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {diff > 0 ? '+' : ''}{diff}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">No allocation targets set yet.</p>
      )}
    </div>
  )
}
