'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'

// The currencies people use most, listed first wherever a currency is chosen.
export const COMMON_CURRENCIES = ['IDR', 'USD', 'TWD', 'SGD', 'MYR', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD']

// "US Dollar" for "USD"; the code itself when the browser has no name for it.
export function currencyName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) || code
  } catch {
    return code
  }
}

// "USD · US Dollar", for dropdowns wide enough to show it.
export const currencyLabel = (code) => `${code} \u00b7 ${currencyName(code)}`

// The common currencies first (in their usual order), then the rest A to Z, each once.
export function sortCurrencies(codes) {
  const unique = Array.from(new Set(codes))
  const common = COMMON_CURRENCIES.filter((c) => unique.includes(c))
  return [...common, ...unique.filter((c) => !COMMON_CURRENCIES.includes(c)).sort()]
}

// One list for every currency dropdown in the app: the currencies the server
// has exchange rates for, so whatever is picked can always be converted.
let cached = null
export function useSupportedCurrencies() {
  const [list, setList] = useState(cached || [])
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!cached) {
        try {
          cached = (await request('/accounts/supported-currencies')).currencies
        } catch {
          return
        }
      }
      if (!cancelled) setList(cached)
    }
    init()
    return () => { cancelled = true }
  }, [])
  return list
}
