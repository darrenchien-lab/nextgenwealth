'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { getPreferredTheme, setTheme as persistTheme } from '@/lib/theme'

// A small floating icon button (placed in a corner of the content area by
// the caller) rather than a labeled row in the Sidebar — it needs to stay
// visible no matter which page/menu item is currently open, not live
// inside the sidebar's own column.
export default function ThemeToggle() {
  const [theme, setThemeState] = useState(null)

  useEffect(() => {
    function init() {
      setThemeState(getPreferredTheme())
    }
    init()
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    persistTheme(next)
  }

  if (theme === null) return null

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200 transition-all duration-150 hover:scale-110 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:text-gray-200"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
