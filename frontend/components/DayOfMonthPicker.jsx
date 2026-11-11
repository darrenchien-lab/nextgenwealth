'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

// Picks a day of the month from a small calendar-style grid instead of a long
// native dropdown. Days 29–31 are offered too: in a month too short for them
// the cycle starts on that month's last day.
// `label` is the text on the button (e.g. "The 10th of each month").
export default function DayOfMonthPicker({ value, onChange, label, className = '' }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (root.current && !root.current.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm transition-colors duration-150 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 ${open ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-300 dark:border-gray-600'}`}
      >
        <CalendarDays size={15} className="shrink-0 text-gray-400 dark:text-gray-500" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform duration-150 dark:text-gray-500 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="dialog" aria-label="Pick a day of the month" className="absolute right-0 top-full z-30 mt-2 w-[19.5rem] max-w-[calc(100vw-2rem)] rounded-xl bg-white p-4 shadow-xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Day of the month</p>
          <p className="mb-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">Each cycle starts on this day. Pick your payday.</p>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((day) => {
              const selected = Number(value) === day
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => { onChange(day); setOpen(false) }}
                  aria-pressed={selected}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm font-medium transition-colors duration-100 ${selected ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {day}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
            {Number(value) >= 29
              ? `In months without a ${value}th, the cycle starts on the last day of that month.`
              : 'For paydays on the 29th–31st: in shorter months the cycle starts on the last day of the month.'}
          </p>
        </div>
      )}
    </div>
  )
}
