'use client'

import ScrollFadeList from '@/components/ScrollFadeList'

// The list beside a donut: one row per slice with its colour, name and share.
// Asset Allocation and Expense Breakdown both use it, so the two cards read the
// same way. Hovering a row (onActiveChange) highlights the same slice in the donut.
//
// rows: { key, label, color, percentage, title }
export default function BreakdownList({ rows, activeIndex, onActiveChange, className = '' }) {
  return (
    <ScrollFadeList className={`space-y-0.5 overflow-x-hidden pr-1 ${className}`}>
      {rows.map((row, i) => (
        <li
          key={row.key}
          title={row.title}
          onMouseEnter={() => onActiveChange(i)}
          onMouseLeave={() => onActiveChange(null)}
          className={`flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs transition-colors duration-100 xl:text-[13px] ${activeIndex === i ? 'bg-gray-100 dark:bg-gray-700/60' : ''}`}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="truncate">{row.label}</span>
          </span>
          <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{row.percentage}%</span>
        </li>
      ))}
    </ScrollFadeList>
  )
}
