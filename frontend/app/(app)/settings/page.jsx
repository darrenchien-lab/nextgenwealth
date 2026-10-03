'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'

const COMMON_CURRENCIES = ['IDR', 'USD', 'TWD', 'SGD', 'MYR', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD']

export default function SettingsPage() {
  const [currentCurrency, setCurrentCurrency] = useState('')
  const [selectedCurrency, setSelectedCurrency] = useState('IDR')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const [currentCycleDay, setCurrentCycleDay] = useState(1)
  const [selectedCycleDay, setSelectedCycleDay] = useState(1)
  const [cycleLoading, setCycleLoading] = useState(true)
  const [cycleLoadError, setCycleLoadError] = useState('')
  const [cycleSaveError, setCycleSaveError] = useState('')
  const [cycleSaved, setCycleSaved] = useState(false)
  const [cycleSaving, setCycleSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await request('/accounts/display-currency')
        setCurrentCurrency(data.displayCurrency)
        setSelectedCurrency(data.displayCurrency)
      } catch (err) {
        setLoadError(err.message || 'Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    async function loadCycle() {
      try {
        const data = await request('/accounts/cycle-start-day')
        setCurrentCycleDay(data.cycleStartDay)
        setSelectedCycleDay(data.cycleStartDay)
      } catch (err) {
        setCycleLoadError(err.message || 'Failed to load settings')
      } finally {
        setCycleLoading(false)
      }
    }
    load()
    loadCycle()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaveError('')
    setSaved(false)
    setSaving(true)
    try {
      const result = await request('/accounts/display-currency', {
        method: 'PUT',
        body: JSON.stringify({ currency: selectedCurrency })
      })
      setCurrentCurrency(result.displayCurrency)
      setSaved(true)
    } catch (err) {
      setSaveError(err.message || 'Failed to save display currency')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCycle(e) {
    e.preventDefault()
    setCycleSaveError('')
    setCycleSaved(false)
    setCycleSaving(true)
    try {
      const result = await request('/accounts/cycle-start-day', {
        method: 'PUT',
        body: JSON.stringify({ cycleStartDay: Number(selectedCycleDay) })
      })
      setCurrentCycleDay(result.cycleStartDay)
      setCycleSaved(true)
    } catch (err) {
      setCycleSaveError(err.message || 'Failed to save budget cycle start day')
    } finally {
      setCycleSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>

      <div className="max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Display Currency</h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Dashboard, net worth, and reports show combined totals converted into this currency.
          Individual accounts still show in their own currency.
        </p>

        {loadError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{loadError}</p>}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Current: <span className="font-medium text-gray-900 dark:text-gray-100">{currentCurrency}</span></p>
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
            >
              {COMMON_CURRENCIES.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>

            {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
            {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Display currency updated.</p>}

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}
      </div>

      <div className="max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Budget Cycle Start Day</h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          The dashboard, cash flow, monthly trend, expense breakdown, and budgets all use a
          &quot;month&quot; that starts on this day (e.g. your payday) instead of always the 1st.
        </p>

        {cycleLoadError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{cycleLoadError}</p>}

        {cycleLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : (
          <form onSubmit={handleSaveCycle} className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Current: <span className="font-medium text-gray-900 dark:text-gray-100">Day {currentCycleDay}</span></p>
            <select
              value={selectedCycleDay}
              onChange={(e) => setSelectedCycleDay(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>

            {cycleSaveError && <p className="text-sm text-red-600 dark:text-red-400">{cycleSaveError}</p>}
            {cycleSaved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Budget cycle start day updated.</p>}

            <button
              type="submit"
              disabled={cycleSaving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {cycleSaving ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
