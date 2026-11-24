'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info, ChevronRight, Sparkles } from 'lucide-react'
import { request } from '@/lib/apiClient'
import PageSkeleton from '@/components/PageSkeleton'

const TONES = {
  warning: { icon: AlertTriangle, box: 'bg-amber-50 ring-amber-100 dark:bg-amber-900/20 dark:ring-amber-800/40', iconColor: 'text-amber-600 dark:text-amber-400' },
  positive: { icon: CheckCircle2, box: 'bg-emerald-50 ring-emerald-100 dark:bg-emerald-900/20 dark:ring-emerald-800/40', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  info: { icon: Info, box: 'bg-gray-50 ring-gray-100 dark:bg-gray-900/40 dark:ring-gray-700', iconColor: 'text-blue-600 dark:text-blue-400' }
}

const SECTIONS = [
  { tone: 'warning', title: 'Needs your attention' },
  { tone: 'info', title: 'Good to know' },
  { tone: 'positive', title: 'Going well' }
]

function InsightItem({ item }) {
  const tone = TONES[item.tone] || TONES.info
  const Icon = tone.icon
  const body = (
    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ${tone.box}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${tone.iconColor}`} />
      <div className="min-w-0 flex-1">
        {item.title && <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>}
        <p className="text-sm text-gray-600 dark:text-gray-300">{item.text}</p>
      </div>
      {item.href && <ChevronRight size={16} className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" />}
    </div>
  )
  return item.href ? <Link href={item.href} className="block transition-opacity duration-150 hover:opacity-80">{body}</Link> : body
}

export default function InsightsPage() {
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [aiSummary, setAiSummary] = useState(false)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function loadSummary() {
    setSummaryLoading(true)
    try {
      const data = await request('/insights/summary')
      setSummary(data.summary)
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const [data, config] = await Promise.all([request('/insights'), request('/insights/config')])
        setInsights(data)
        setAiSummary(!!config.aiSummary)
        if (config.aiSummary) loadSummary()
      } catch (err) {
        setLoadError(err.message || 'Failed to load insights')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function toggleSummary() {
    const next = !aiSummary
    setToggling(true)
    try {
      await request('/insights/preferences', { method: 'PUT', body: JSON.stringify({ aiSummary: next }) })
      setAiSummary(next)
      setSummary(null)
      if (next) loadSummary()
    } catch (err) {
      setLoadError(err.message || 'Could not save that')
    } finally {
      setToggling(false)
    }
  }

  if (loading) return <PageSkeleton />

  const items = insights?.items || []
  const grouped = SECTIONS.map((section) => ({ ...section, items: items.filter((i) => i.tone === section.tone) })).filter((s) => s.items.length > 0)
  const plain = insights?.source === 'starter'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Insights</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">What stands out in your money this cycle.</p>
      </div>

      {loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {!plain && insights?.headline && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white to-emerald-50/60 p-5 shadow-sm ring-1 ring-gray-100 dark:from-gray-800 dark:to-gray-800 dark:ring-gray-700">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />
          <p className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Sparkles size={18} className="text-emerald-600 dark:text-emerald-400" /> {insights.headline}
          </p>
          {aiSummary && (
            summaryLoading ? (
              <div className="mt-3 space-y-2" aria-label="Writing your summary">
                <div className="h-3 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
              </div>
            ) : summary && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{summary}</p>
          )}
        </div>
      )}

      {plain ? (
        <ul className="space-y-2.5">{items.map((item) => <li key={item.id}><InsightItem item={item} /></li>)}</ul>
      ) : (
        grouped.map((section) => (
          <section key={section.tone}>
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              {section.title} <span className="font-normal text-gray-400 dark:text-gray-500">· {section.items.length}</span>
            </h2>
            <ul className="space-y-2.5">
              {section.items.map((item) => <li key={item.id}><InsightItem item={item} /></li>)}
            </ul>
          </section>
        ))
      )}

      <div className="flex items-start justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Personal summary</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Let AI write a short summary of your cycle at the top of this page. To do this, the findings above, including amounts and category names, are read by the AI model that runs on our own server, and are not sent to any outside service. This is off unless you turn it on.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={aiSummary}
          aria-label="Personal summary"
          disabled={toggling}
          onClick={toggleSummary}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-60 ${aiSummary ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${aiSummary ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    </div>
  )
}
