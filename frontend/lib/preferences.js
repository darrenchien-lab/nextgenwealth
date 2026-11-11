// Per-device display preferences, kept in the browser. Storage can be blocked
// (private mode, cleared site data), so every read and write is guarded and
// the app works the same without it.
const HIDE_AMOUNTS_KEY = 'nextgen-hide-amounts'

// Whether balance cards should start with their amounts hidden.
export function getHideAmountsDefault() {
  try {
    return window.localStorage.getItem(HIDE_AMOUNTS_KEY) === '1'
  } catch {
    return false
  }
}

export function setHideAmountsDefault(hidden) {
  try {
    if (hidden) window.localStorage.setItem(HIDE_AMOUNTS_KEY, '1')
    else window.localStorage.removeItem(HIDE_AMOUNTS_KEY)
  } catch {
    // Ignore: the choice just won't be remembered.
  }
}
