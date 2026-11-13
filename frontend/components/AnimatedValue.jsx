'use client'

import { useEffect, useState } from 'react'

// Writes `digits` into the number pattern of `text` from the right, keeping its
// separators and symbols, so "Rp 1.234.567" can pass through "Rp 482.913".
function fillPattern(text, digits) {
  const match = text.match(/\d[\d.,]*/)
  if (!match) return text
  const pattern = match[0]
  let out = ''
  let d = digits.length - 1
  for (let i = pattern.length - 1; i >= 0; i--) {
    if (/\d/.test(pattern[i])) {
      if (d < 0) break
      out = digits[d--] + out
    } else if (d >= 0) {
      out = pattern[i] + out
    }
  }
  return text.slice(0, match.index) + out + text.slice(match.index + pattern.length)
}

// Shows a formatted figure (currency, percent...) that counts up from zero to
// its value when it first appears or changes. The last frame is always the
// exact original text; it is shown straight away for people who prefer no motion.
export default function AnimatedValue({ text, duration = 700 }) {
  const [shown, setShown] = useState(text)

  useEffect(() => {
    const match = String(text).match(/\d[\d.,]*/)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!match || reduce) {
      const id = requestAnimationFrame(() => setShown(text))
      return () => cancelAnimationFrame(id)
    }
    const target = Number(match[0].replace(/\D/g, ''))
    const start = performance.now()
    let id
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(t >= 1 ? text : fillPattern(text, String(Math.round(target * eased))))
      if (t < 1) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [text, duration])

  return <>{shown}</>
}
