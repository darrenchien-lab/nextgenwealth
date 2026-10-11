// Today's date as 'YYYY-MM-DD' in the user's local time zone (not UTC via
// toISOString, which can be yesterday or tomorrow) — the default and the
// upper limit for "when did this happen" date pickers.
export function todayInputValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
