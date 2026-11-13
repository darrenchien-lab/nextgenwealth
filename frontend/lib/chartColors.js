import { useEffect, useState } from 'react'

// Categorical palette for pie/donut charts — eight hues in a fixed order.
// Deliberately calm rather than vivid: similar lightness and moderate colour
// strength, no pure primaries, with a blue-grey as the eighth, so a ring of
// them reads as one family. Stepped separately for each theme's card surface
// (white / gray-800), and checked for separation between every pair (OKLab
// distance 7.9+ in both themes) and for colour-blind viewers (5+ under
// deuteranopia). The "Other" slice stays a plain grey, apart from these.
const CATEGORY_COLORS = {
  light: ['#3e6fd1', '#1b8a6b', '#c98a1f', '#7f70dd', '#e07a99', '#2e9bb0', '#b8582f', '#6a7d94'],
  dark: ['#5b8def', '#2a9d7c', '#e0a246', '#9a8cf0', '#f08fab', '#45b0c4', '#d98552', '#8993a3']
}
const OTHER_COLOR = { light: '#9ca3af', dark: '#6b7280' }

export const OTHER_LABEL = 'Other'

// Gives every slice its own color. Past eight slices there aren't enough
// clearly distinguishable hues, so the smallest ones are folded into a
// single gray "Other" slice instead of reusing a color. Colors are handed
// out in alphabetical order of the slice names (the order the legend lists
// them in), so a slice keeps its color however the data happens to be sorted.
// A real slice already called "Other" (e.g. a user's own "Other" category)
// goes into the folded one, so there's never two slices with that name.
export function withDistinctColors(rows, { nameKey, valueKey = 'amount', theme = 'light' }) {
  const palette = CATEGORY_COLORS[theme]
  let slices = rows

  if (rows.length > palette.length) {
    const bySize = [...rows]
      .filter((r) => String(r[nameKey]) !== OTHER_LABEL)
      .sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]))
    const kept = new Set(bySize.slice(0, palette.length - 1))
    const folded = rows.filter((r) => !kept.has(r))
    slices = [
      ...rows.filter((r) => kept.has(r)),
      {
        [nameKey]: OTHER_LABEL,
        [valueKey]: Math.round(folded.reduce((sum, r) => sum + Number(r[valueKey]), 0) * 100) / 100,
        percentage: Math.round(folded.reduce((sum, r) => sum + Number(r.percentage || 0), 0) * 10) / 10,
        isOther: true
      }
    ]
  }

  const colorOrder = slices
    .filter((s) => !s.isOther)
    .map((s) => String(s[nameKey]))
    .sort((a, b) => a.localeCompare(b))

  return slices.map((s) => ({
    ...s,
    color: s.isOther ? OTHER_COLOR[theme] : palette[colorOrder.indexOf(String(s[nameKey]))]
  }))
}

// Tracks the app's light/dark theme (the `dark` class on <html>), so charts
// can pick the palette stepped for the current card surface.
export function useChartTheme() {
  const [theme, setTheme] = useState('light')
  useEffect(() => {
    const root = document.documentElement
    const update = () => setTheme(root.classList.contains('dark') ? 'dark' : 'light')
    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}
