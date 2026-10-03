import { useEffect, useState } from 'react'

// Categorical palette for pie/donut charts — eight hues in a fixed order,
// checked for color-blind separation between neighbors and stepped
// separately for each theme's card surface (white / gray-800).
const CATEGORY_COLORS = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
}
const OTHER_COLOR = { light: '#9ca3af', dark: '#6b7280' }

export const OTHER_LABEL = 'Other'

// Gives every slice its own color. Past eight slices there aren't enough
// clearly distinguishable hues, so the smallest ones are folded into a
// single gray "Other" slice instead of reusing a color. Colors are handed
// out in alphabetical order of the slice names (the order the legend lists
// them in), so a slice keeps its color however the data happens to be sorted.
export function withDistinctColors(rows, { nameKey, valueKey = 'amount', theme = 'light' }) {
  const palette = CATEGORY_COLORS[theme]
  let slices = rows

  if (rows.length > palette.length) {
    const bySize = [...rows].sort((a, b) => Number(b[valueKey]) - Number(a[valueKey]))
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
