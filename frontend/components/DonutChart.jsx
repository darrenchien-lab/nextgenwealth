'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

// A thin, flat ring with hairline gaps between slices and the figure in the
// middle, in place of a chunky ring with rounded, spaced-out pieces. The hole
// says how many slices there are; point at one (or its row in the list beside
// the chart, via `activeIndex`/`onActiveChange`) and the others dim and the
// hole shows that slice's name and share. No amounts are drawn, so it follows
// the dashboard's hidden-amounts setting by showing none.
//
// data rows: { color, percentage, ...nameKey }; `unit` names the slices
// ("types", "categories") in the resting hole text.
export default function DonutChart({ data, nameKey, valueKey = 'amount', unit = 'items', activeIndex = null, onActiveChange, className = '' }) {
  const [hovered, setHovered] = useState(null)
  const active = activeIndex ?? hovered
  const slice = active !== null && data[active] ? data[active] : null
  const set = (i) => {
    setHovered(i)
    if (onActiveChange) onActiveChange(i)
  }

  return (
    <div className={`relative shrink-0 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            startAngle={90}
            endAngle={-270}
            innerRadius="76%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 1.2 : 0}
            cornerRadius={0}
            stroke="none"
            isAnimationActive={false}
            onMouseEnter={(_, i) => set(i)}
            onMouseLeave={() => set(null)}
          >
            {data.map((entry, i) => (
              <Cell key={entry[nameKey]} fill={entry.color} fillOpacity={active === null || active === i ? 1 : 0.35} stroke="none" />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[18%] text-center">
        {slice ? (
          <>
            <span className="max-w-full truncate text-[10px] leading-tight text-gray-500 dark:text-gray-400">{slice[nameKey]}</span>
            <span className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">{slice.percentage}%</span>
          </>
        ) : (
          <>
            <span className="text-base font-semibold leading-tight text-gray-900 dark:text-gray-100">{data.length}</span>
            <span className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">{unit}</span>
          </>
        )}
      </div>
    </div>
  )
}
