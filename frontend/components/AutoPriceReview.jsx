'use client'

import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'
import MarketSearch from '@/components/MarketSearch'

const SELECT = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const OPTION = 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100'
const keyOf = (c) => `${c.source}:${c.symbol}`

// Matches each manually priced holding to a market listing (found by its
// name, in its own currency) so its price updates by itself. Only a listing
// whose code is the holding's name is pre-selected; everything else is left
// on "by hand" for the user to choose, or searched for by hand.
export default function AutoPriceReview({ onClose, onDone }) {
  const [rows, setRows] = useState(null)
  const [choice, setChoice] = useState({})
  const [searchingFor, setSearchingFor] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const { suggestions } = await request('/investments/market/suggestions')
        setRows(suggestions)
        const initial = {}
        for (const s of suggestions) initial[s.holdingId] = s.recommended >= 0 ? keyOf(s.candidates[s.recommended]) : 'manual'
        setChoice(initial)
      } catch (err) {
        setError(err.message || "Couldn't look up market prices")
        setRows([])
      }
    }
    load()
  }, [])

  function addCandidate(holdingId, candidate) {
    setRows((list) => list.map((r) => (r.holdingId === holdingId && !r.candidates.some((c) => keyOf(c) === keyOf(candidate))
      ? { ...r, candidates: [...r.candidates, candidate] }
      : r)))
    setChoice((c) => ({ ...c, [holdingId]: keyOf(candidate) }))
    setSearchingFor(null)
  }

  const chosen = (rows || []).filter((r) => choice[r.holdingId] && choice[r.holdingId] !== 'manual')

  async function turnOn() {
    setSaving(true)
    setError('')
    const failed = []
    for (const row of chosen) {
      const [source, ...rest] = choice[row.holdingId].split(':')
      try {
        await request(`/investments/${row.holdingId}/price-source`, { method: 'PUT', body: JSON.stringify({ source, symbol: rest.join(':') }) })
      } catch (err) {
        failed.push(`${row.assetName}: ${err.message}`)
      }
    }
    setSaving(false)
    if (failed.length > 0) {
      setError(failed.join(' · '))
      return
    }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Automatic prices</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
        </div>
        <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          Each holding is matched to its market listing. Check the matches, then turn it on — prices then update every day after the markets close. Anything left on “By hand” keeps working as it does now.
        </p>

        {rows === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400"><Loader2 size={16} className="animate-spin" /> Looking up market prices…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-gray-500 dark:text-gray-400">All your holdings already update automatically.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((row) => {
              const selected = row.candidates.find((c) => keyOf(c) === choice[row.holdingId])
              return (
                <div key={row.holdingId} className="py-3">
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[9rem_1fr_8rem]">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.assetName} <span className="text-xs font-normal text-gray-400">{row.currency}</span></p>
                    <select
                      value={choice[row.holdingId] || 'manual'}
                      onChange={(e) => setChoice({ ...choice, [row.holdingId]: e.target.value })}
                      className={SELECT}
                    >
                      {row.candidates.map((c) => (
                        <option key={keyOf(c)} value={keyOf(c)} className={OPTION}>{c.name} · {c.symbol} · {c.exchange}</option>
                      ))}
                      <option value="manual" className={OPTION}>By hand (no automatic price)</option>
                    </select>
                    <p className="text-right text-sm text-gray-700 dark:text-gray-300">{selected ? formatCurrency(selected.price, selected.currency) : '—'}</p>
                  </div>
                  {row.candidates.length === 0 && searchingFor !== row.holdingId && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      No listing found for this name.{' '}
                      <button type="button" onClick={() => setSearchingFor(row.holdingId)} className="font-medium text-blue-600 hover:underline dark:text-blue-400">Search the market…</button>
                    </p>
                  )}
                  {row.candidates.length > 0 && searchingFor !== row.holdingId && (
                    <button type="button" onClick={() => setSearchingFor(row.holdingId)} className="mt-1 text-xs text-gray-400 hover:text-blue-600 hover:underline dark:text-gray-500">Not the right one? Search…</button>
                  )}
                  {searchingFor === row.holdingId && (
                    <div className="mt-2">
                      <MarketSearch currency={row.currency} autoFocus onSelect={(c) => addCandidate(row.holdingId, c)} />
                      <button type="button" onClick={() => setSearchingFor(null)} className="mt-1 text-xs text-gray-400 hover:underline">Cancel</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
          <button
            onClick={turnOn}
            disabled={saving || chosen.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Turning on…' : `Turn on for ${chosen.length} holding${chosen.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
