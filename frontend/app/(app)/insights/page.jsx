'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'

export default function InsightsPage() {
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [config, setConfig] = useState({ activeProvider: 'rule_based', apiKey: '', apiUrl: '' })
  const [configError, setConfigError] = useState('')
  const [configSaved, setConfigSaved] = useState(false)

  async function loadInsights() {
    setLoading(true)
    try {
      const data = await request('/insights')
      setInsights(data)
    } catch (err) {
      setLoadError(err.message || 'Failed to load insights')
    } finally {
      setLoading(false)
    }
  }

  async function loadConfig() {
    try {
      const data = await request('/insights/config')
      setConfig({
        activeProvider: data.activeProvider,
        apiKey: data.providerConfig?.apiKey || '',
        apiUrl: data.providerConfig?.apiUrl || ''
      })
    } catch {
      // Default config values are fine if none exist yet.
    }
  }

  useEffect(() => {
    function init() {
      loadInsights()
      loadConfig()
    }
    init()
  }, [])

  async function handleSaveConfig(e) {
    e.preventDefault()
    setConfigError('')
    setConfigSaved(false)
    try {
      const providerConfig = config.activeProvider === 'external_ai'
        ? { apiKey: config.apiKey, apiUrl: config.apiUrl || undefined }
        : {}
      await request('/insights/config', {
        method: 'PUT',
        body: JSON.stringify({ activeProvider: config.activeProvider, providerConfig })
      })
      setConfigSaved(true)
      loadInsights()
    } catch (err) {
      setConfigError(err.message || 'Failed to save provider configuration')
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Insights</h1>

      <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">AI Insights</h2>
        {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading insights...</p>
        ) : (
          <ul className="space-y-2">
            {insights.insights.map((text, i) => (
              <li key={i} className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-sm text-emerald-800">
                {text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Insight Provider Configuration</h2>
        <form onSubmit={handleSaveConfig} className="space-y-3">
          <select
            value={config.activeProvider}
            onChange={(e) => setConfig({ ...config, activeProvider: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm sm:w-64"
          >
            <option value="rule_based">Rule-based (built-in)</option>
            <option value="external_ai">External AI provider</option>
          </select>

          {config.activeProvider === 'external_ai' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="password"
                placeholder="API key"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
              />
              <input
                placeholder="API URL (optional)"
                value={config.apiUrl}
                onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                className="rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm"
              />
            </div>
          )}

          {configError && <p className="text-sm text-red-600 dark:text-red-400">{configError}</p>}
          {configSaved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Provider configuration saved.</p>}

          <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Save
          </button>
        </form>
      </div>
    </div>
  )
}
