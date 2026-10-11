'use client'

const formatAsOf = (asOf) => {
  const date = new Date(`${asOf}T00:00:00`)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

const compareLabel = ({ offset, asOf }) => (
  offset === 1 ? `End of last cycle (${formatAsOf(asOf)})` : `${offset} cycles ago (${formatAsOf(asOf)})`
)

// Change since the compared cycle end, in percentage points, colored by
// whether it moved toward the target (green) or away from it (red).
function changeOf(row) {
  if (row.previousPercentage === null) return null
  const diff = Math.round((row.actualPercentage - row.previousPercentage) * 10) / 10
  if (diff === 0) return { text: '0 pts', className: 'text-gray-400 dark:text-gray-500' }
  const toward = Math.abs(row.targetPercentage - row.actualPercentage) < Math.abs(row.targetPercentage - row.previousPercentage)
  return {
    text: `${diff > 0 ? '▲ +' : '▼ '}${diff} pts`,
    className: toward ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  }
}

// Target vs actual allocation as one progress row per target: the bar is
// the actual share now, a dark tick marks the target and a light tick the
// share at the end of the chosen past cycle, so it reads at a glance whether
// the portfolio is moving toward its targets.
export default function TargetAllocationCard({ data, onCompareChange }) {
  const rows = data?.comparison || []
  const options = data?.compareOptions || []
  const compareWith = data?.compareWith || null

  const scale = Math.max(10, ...rows.flatMap((r) => [r.actualPercentage, r.targetPercentage, r.previousPercentage ?? 0])) * 1.1
  const position = (value) => `${Math.min(100, Math.max(0, (value / scale) * 100))}%`

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Target vs Actual Allocation</h2>
        {rows.length > 0 && (options.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            Compare with
            <select
              value={compareWith?.offset ?? ''}
              onChange={(e) => onCompareChange(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {options.map((o) => <option key={o.offset} value={o.offset}>{compareLabel(o)}</option>)}
            </select>
          </label>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">No earlier cycle to compare with yet</span>
        ))}
      </div>

      {rows.length > 0 ? (
        <>
          <div className="space-y-4">
            {rows.map((row) => {
              const change = changeOf(row)
              return (
                <div key={row.assetName}>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{row.assetName}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{row.actualPercentage}%</span>
                      {' / '}{row.targetPercentage}% target
                      {change && <span className={`ml-2 text-xs font-medium ${change.className}`}>{change.text}</span>}
                    </span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-gray-100 dark:bg-gray-700">
                    <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: position(row.actualPercentage) }} />
                    {row.previousPercentage !== null && (
                      <div
                        title={`${compareWith ? formatAsOf(compareWith.asOf) : ''}: ${row.previousPercentage}%`}
                        className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 bg-gray-300 dark:bg-gray-500"
                        style={{ left: position(row.previousPercentage) }}
                      />
                    )}
                    <div
                      title={`Target: ${row.targetPercentage}%`}
                      className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 bg-gray-800 dark:bg-gray-100"
                      style={{ left: position(row.targetPercentage) }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 dark:border-gray-700 pt-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-500" />Actual now</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-gray-800 dark:bg-gray-100" />Target</span>
            {compareWith && <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-gray-300 dark:bg-gray-500" />{formatAsOf(compareWith.asOf)}</span>}
            {compareWith && (
              <>
                <span><span className="font-medium text-emerald-600 dark:text-emerald-400">▲▼</span> Toward target</span>
                <span><span className="font-medium text-red-600 dark:text-red-400">▲▼</span> Away from target</span>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
          No allocation targets set yet — set them on the Goals page
        </div>
      )}
    </div>
  )
}
