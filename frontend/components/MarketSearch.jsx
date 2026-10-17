'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, Plus } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency } from '@/lib/format'

// Type a code or company name, pick the market listing. Listings in
// `currency` (when given) come first; others are shown dimmed, since a
// holding is normally priced in its own currency. With onCustom, the list
// ends with an option to use the typed text as a custom (unlisted) asset.
export default function MarketSearch({ currency, onSelect, onCustom, placeholder = 'Search by ticker or company name', autoFocus = false, children }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return undefined
    const id = ++latest.current
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await request(`/investments/market/search?q=${encodeURIComponent(q)}${currency ? `&currency=${currency}` : ''}`)
        if (id === latest.current) {
          setResults(data.results)
          setSearched(true)
        }
      } catch {
        if (id === latest.current) setResults([])
      } finally {
        if (id === latest.current) setLoading(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [query, currency])

  const showResults = query.trim().length >= 2

  return (
    <div className="w-full">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>
      {showResults && (
        <div className="mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800">
          {results.map((r) => {
            const otherCurrency = currency && r.currency !== currency
            return (
              <button
                type="button"
                key={`${r.source}:${r.symbol}`}
                onClick={() => onSelect(r)}
                className={`flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/60 ${otherCurrency ? 'opacity-60' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">{r.name}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{r.symbol} · {r.exchange}{otherCurrency ? ` · trades in ${r.currency}` : ''}</span>
                </span>
                <span className="shrink-0 text-sm text-gray-700 dark:text-gray-300">{formatCurrency(r.price, r.currency)}</span>
              </button>
            )
          })}
          {!loading && searched && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No market listing found for “{query.trim()}”. Try the official ticker (e.g. BBCA, AAPL) or the company name.</p>
          )}
          {onCustom && (
            <button
              type="button"
              onClick={() => onCustom(query.trim())}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/60"
            >
              <Plus size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="text-gray-700 dark:text-gray-200">Add <strong>“{query.trim()}”</strong> as a custom asset <span className="text-gray-400 dark:text-gray-500">· price entered manually</span></span>
            </button>
          )}
          {children}
        </div>
      )}
    </div>
  )
}
