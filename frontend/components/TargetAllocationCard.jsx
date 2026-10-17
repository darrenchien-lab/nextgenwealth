'use client'

import { useState } from 'react'
import { X, Crosshair } from 'lucide-react'
import { request } from '@/lib/apiClient'
import ScrollFadeBox from '@/components/ScrollFadeBox'

const formatAsOf = (asOf) => {
  const date = new Date(`${asOf}T00:00:00`)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

const compareLabel = ({ offset, asOf }) => (
  offset === 1 ? `End of last cycle (${formatAsOf(asOf)})` : `${offset} cycles ago (${formatAsOf(asOf)})`
)

// Change since the compared cycle end, in percentage points, colored by
// whether it moved toward the target (green) or away from it (red).
function changeOf(row) {
  if (row.previousPercentage === null) return null
  const diff = Math.round((row.actualPercentage - row.previousPercentage) * 10) / 10
  if (diff === 0) return { text: '0 pts', className: 'text-gray-400 dark:text-gray-500' }
  const toward = Math.abs(row.targetPercentage - row.actualPercentage) < Math.abs(row.targetPercentage - row.previousPercentage)
  return {
    text: `${diff > 0 ? '▲ +' : '▼ '}${diff} pts`,
    className: toward ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  }
}

// Target vs actual allocation as one progress row per target: the bar is
// the actual share now, a dark tick marks the target and a light tick the
// share at the end of the chosen past cycle, so it reads at a glance whether
// the portfolio is moving toward its targets. The targets (and target CAGR)
// are edited right here, next to what they're compared against; onSaved gets
// the refreshed comparison after a save.
export default function TargetAllocationCard({ data, onCompareChange, onSaved }) {
  const rows = data?.comparison || []
  const options = data?.compareOptions || []
  const compareWith = data?.compareWith || null

  const [editing, setEditing] = useState(false)
  const [targetRows, setTargetRows] = useState([])
  const [targetCagr, setTargetCagr] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  function openEditor() {
    setTargetRows(rows.length > 0
      ? rows.map((r) => ({ assetName: r.assetName, targetPercentage: String(r.targetPercentage) }))
      : [{ assetName: '', targetPercentage: '' }])
    setTargetCagr(data?.targetCagr !== null && data?.targetCagr !== undefined ? String(data.targetCagr) : '')
    setSaveError('')
    setEditing(true)
  }

  const updateRow = (index, field, value) => setTargetRows((list) => list.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  const targetTotal = targetRows.reduce((sum, r) => sum + (Number(r.targetPercentage) || 0), 0)

  async function handleSave(e) {
    e.preventDefault()
    setSaveError('')
    const targets = targetRows
      .filter((r) => r.assetName.trim() !== '')
      .map((r) => ({ assetName: r.assetName.trim(), targetPercentage: Number(r.targetPercentage) }))
    if (targets.length === 0) return setSaveError('Add at least one category.')
    setSaving(true)
    try {
      const saved = await request('/investments/allocation-targets', {
        method: 'PUT',
        body: JSON.stringify({ targets, targetCagr: targetCagr === '' ? null : Number(targetCagr) })
      })
      setEditing(false)
      onSaved?.(saved)
    } catch (err) {
      setSaveError(err.message || 'Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  const scale = Math.max(10, ...rows.flatMap((r) => [r.actualPercentage, r.targetPercentage, r.previousPercentage ?? 0])) * 1.1
  const position = (value) => `${Math.min(100, Math.max(0, (value / scale) * 100))}%`

  // Nothing to compare yet for someone with no targets and no investments
  // (e.g. a brand-new account), so the card stays out of the way; with
  // investments but no targets it shrinks to a one-line invitation.
  const hasInvestments = Number(data?.totalValue) > 0
  if (!data || (rows.length === 0 && !hasInvestments)) return null

  return (
    // A fixed height with the targets scrolling inside, so it lines up with
    // the card beside it however many targets there are.
    <div className={`rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 ${rows.length > 0 ? 'flex flex-col lg:h-[460px]' : ''}`}>
      {rows.length > 0 && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Target vs Actual Allocation</h2>
          <button onClick={openEditor} className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            {rows.length > 0 ? 'Edit targets' : '+ Set targets'}
          </button>
        </div>
        {rows.length > 0 && (options.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            Compare with
            <select
              value={compareWith?.offset ?? ''}
              onChange={(e) => onCompareChange(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {options.map((o) => <option key={o.offset} value={o.offset}>{compareLabel(o)}</option>)}
            </select>
          </label>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">No earlier cycle to compare with yet</span>
        ))}
      </div>
      )}

      {rows.length > 0 ? (
          <ScrollFadeBox className="pr-1">
          <div className="space-y-4">
            {rows.map((row) => {
              const change = changeOf(row)
              return (
                <div key={row.assetName}>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{row.assetName}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{row.actualPercentage}%</span>
                      {' / '}{row.targetPercentage}% target
                      {change && <span className={`ml-2 text-xs font-medium ${change.className}`}>{change.text}</span>}
                    </span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-gray-100 dark:bg-gray-700">
                    <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: position(row.actualPercentage) }} />
                    {row.previousPercentage !== null && (
                      <div
                        title={`${compareWith ? formatAsOf(compareWith.asOf) : ''}: ${row.previousPercentage}%`}
                        className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 bg-gray-300 dark:bg-gray-500"
                        style={{ left: position(row.previousPercentage) }}
                      />
                    )}
                    <div
                      title={`Target: ${row.targetPercentage}%`}
                      className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 bg-gray-800 dark:bg-gray-100"
                      style={{ left: position(row.targetPercentage) }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 dark:border-gray-700 pt-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500" />Actual now</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-gray-800 dark:bg-gray-100" />Target</span>
            {compareWith && <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-gray-300 dark:bg-gray-500" />{formatAsOf(compareWith.asOf)}</span>}
            {compareWith && (
              <>
                <span><span className="font-medium text-emerald-600 dark:text-emerald-400">▲▼</span> Toward target</span>
                <span><span className="font-medium text-red-600 dark:text-red-400">▲▼</span> Away from target</span>
              </>
            )}
          </div>
          {(data.targetCagr !== null || data.actualCagr) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {data.targetCagr !== null && (
                <span>Target CAGR: <span className="font-semibold text-gray-900 dark:text-gray-100">{data.targetCagr}%</span></span>
              )}
              {data.actualXirr?.available ? (
                <>
                  <span>
                    Return per year: <span className={`font-semibold ${data.actualXirr.xirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{data.actualXirr.xirr}%</span>
                  </span>
                  {data.actualXirr.gainLoss !== null && (
                    <span>
                      Gain/loss: <span className={`font-semibold ${data.actualXirr.gainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{data.actualXirr.gainLoss}%</span>
                    </span>
                  )}
                </>
              ) : data.actualCagr?.available ? (
                <span title={`Since the cost-weighted average purchase date (${data.actualCagr.effectiveStartDate})`}>
                  Actual CAGR: <span className={`font-semibold ${data.actualCagr.cagr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{data.actualCagr.cagr}%</span>
                </span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500" title={data.actualCagr?.reason}>Actual CAGR unavailable</span>
              )}
            </div>
          )}
          </ScrollFadeBox>
      ) : (
        <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            <Crosshair size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Set your target allocation</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Decide how your money should be split — for example 30% in the bank, 25% in Indonesian stocks, 15% in gold — and this card will show how close you are, and whether each part is moving toward its target.
            </p>
          </div>
          <button onClick={openEditor} className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
            Set targets
          </button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[calc(100vh-2rem)] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Allocation targets</h3>
              <button type="button" onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              A target matches a holding&apos;s category (e.g. &quot;Equity Indonesia&quot; for BBCA and BBRI), a holding&apos;s name when it has no category (e.g. &quot;CSPX&quot;), or an account type (e.g. &quot;Bank&quot;).
            </p>
            {targetRows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="Category"
                  value={row.assetName}
                  onChange={(e) => updateRow(i, 'assetName', e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <input
                  type="number" step="any" min="0"
                  placeholder="Target %"
                  value={row.targetPercentage}
                  onChange={(e) => updateRow(i, 'targetPercentage', e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <button type="button" onClick={() => setTargetRows((list) => list.filter((_, j) => j !== i))} className="text-xs font-medium text-red-500 hover:text-red-700 dark:hover:text-red-400">
                  Remove
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setTargetRows((list) => [...list, { assetName: '', targetPercentage: '' }])} className="text-xs font-medium text-emerald-600 hover:text-emerald-800 dark:text-emerald-400">
                + Add category
              </button>
              <span className={`text-xs ${Math.abs(targetTotal - 100) < 0.01 ? 'text-gray-500 dark:text-gray-400' : 'text-amber-600 dark:text-amber-400'}`}>
                Total: {Math.round(targetTotal * 100) / 100}%
              </span>
            </div>
            <label className="flex items-center gap-2 pt-1 text-sm text-gray-600 dark:text-gray-400">
              Target CAGR (%)
              <input
                type="number" step="0.01"
                value={targetCagr}
                onChange={(e) => setTargetCagr(e.target.value)}
                className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save targets'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
