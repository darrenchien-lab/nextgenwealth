const STORAGE_KEY = 'nextgen-wealth-theme'

// Exported so the FOUC-prevention inline script in layout.jsx (which can't
// import this module) and this file agree on the same storage key and logic.
export const THEME_STORAGE_KEY = STORAGE_KEY

export function getPreferredTheme() {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage unavailable (private mode, etc.) — fall through to system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function setTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ignore — theme still applies for this page view, just won't persist.
  }
  applyTheme(theme)
}
