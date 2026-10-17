'use client'

import { useId } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { timeAxisTicks, timeAxisFormatter, timeTooltipFormatter } from '@/lib/chartRanges'

const UP = '#10b981'
const DOWN = '#ef4444'
const TICK = { fontSize: 12, fill: 'var(--chart-axis, #9ca3af)' }

// A single value over time, styled after stock apps: a clean line with no
// point markers over a fading area, green when the range ends at or above
// where it started and red when below, a dashed baseline at the starting
// value, a quiet horizontal-only grid, values on the right, and a crosshair
// with the date and value on hover. `data` rows need a `ts` timestamp (see
// withTimestamps). `secondary` optionally adds a comparison line, e.g. cost
// basis under portfolio value: dashed grey by default, or a solid line in
// its own `color` with a legend when `solid` is set. `markerKey` names a
// row field that, when present, marks that point with a dot (e.g. the days
// something was bought or sold), and `tooltipExtra(row)` adds lines to the
// tooltip as [{ label, value, tone }] (tone: 'up' | 'down'). With a solid
// secondary line, `description` / `secondary.description` explain each line
// in the legend and `hint` adds one line on how to read the two together.
export default function TrendAreaChart({ data, dataKey, name, description, hint, height = 320, formatValue, formatAxisValue, secondary, markerKey, tooltipExtra }) {
  const gradientId = `trend-${useId().replace(/:/g, '')}`
  const first = Number(data[0][dataKey])
  const last = Number(data[data.length - 1][dataKey])
  const color = last >= first ? UP : DOWN

  const values = data.flatMap((row) => [row[dataKey], secondary ? row[secondary.dataKey] : null]).filter((v) => v !== null && v !== undefined).map(Number)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.02 || 1
  const formatDate = timeTooltipFormatter(data)
  const secondaryColor = secondary?.color || 'var(--chart-axis, #9ca3af)'
  const hasSecondaryValues = secondary && data.some((row) => row[secondary.dataKey] !== null && row[secondary.dataKey] !== undefined)

  const renderMarker = ({ cx, cy, payload, index }) => (
    markerKey && payload[markerKey]
      ? <circle key={`m${index}`} cx={cx} cy={cy} r={3.5} fill={color} stroke="var(--tooltip-bg)" strokeWidth={1.5} />
      : <g key={`m${index}`} />
  )

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-lg border border-[var(--tooltip-border)] bg-[var(--tooltip-bg)] px-3 py-2 text-sm text-[var(--tooltip-text)] shadow-md">
        <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(label)}</p>
        {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
          <p key={p.dataKey} className="font-semibold" style={p.dataKey === dataKey ? undefined : { color: secondaryColor, fontWeight: 500 }}>
            {p.dataKey === dataKey ? (secondary?.solid ? `${name}: ` : '') : `${p.name}: `}{formatValue(p.value, p.payload)}
          </p>
        ))}
        {tooltipExtra && tooltipExtra(payload[0].payload).map((line, i) => (
          <p
            key={i}
            className={`text-xs ${line.tone === 'up' ? 'font-medium text-emerald-600 dark:text-emerald-400' : line.tone === 'down' ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {line.label}{line.value !== undefined ? `: ${line.value}` : ''}
          </p>
        ))}
      </div>
    )
  }

  return (
    <>
    {secondary?.solid && hasSecondaryValues && (
      <div className="mb-3 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 shrink-0 rounded" style={{ backgroundColor: color }} />
            <span className="font-medium text-gray-700 dark:text-gray-300">{name}</span>
            {description && <span>— {description}</span>}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 shrink-0 rounded" style={{ backgroundColor: secondaryColor }} />
            <span className="font-medium text-gray-700 dark:text-gray-300">{secondary.name}</span>
            {secondary.description && <span>— {secondary.description}</span>}
          </span>
        </div>
        {hint && <p className="text-gray-400 dark:text-gray-500">{hint}</p>}
      </div>
    )}
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          ticks={timeAxisTicks(data, 7)}
          tickFormatter={timeAxisFormatter(data)}
          tick={TICK}
          axisLine={false}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          orientation="right"
          domain={[min - pad, max + pad]}
          tickFormatter={formatAxisValue}
          tick={TICK}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <ReferenceLine y={first} stroke="var(--chart-axis, #9ca3af)" strokeDasharray="2 4" strokeOpacity={0.7} />
        <Tooltip content={renderTooltip} cursor={{ stroke: 'var(--chart-axis, #9ca3af)', strokeWidth: 1 }} />
        <Area
          type="linear"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={markerKey ? renderMarker : false}
          activeDot={{ r: 4, fill: color, stroke: 'var(--tooltip-bg)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {secondary && (
          <Line
            type="linear"
            dataKey={secondary.dataKey}
            name={secondary.name}
            stroke={secondaryColor}
            strokeWidth={secondary.solid ? 2 : 1.5}
            strokeDasharray={secondary.solid ? undefined : '4 4'}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
    </>
  )
}
