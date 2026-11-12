import Link from 'next/link'
import { TrendingUp, TrendingDown, Eye, EyeOff, ChevronRight } from 'lucide-react'

const COLOR_STYLES = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
}

// No large icon badge here (unlike other cards' headers) — at six-across on
// a real desktop width, IDR figures are long enough that the icon box's
// ~36px would push the value into an ellipsis. A small inline icon next to
// the label keeps the visual cue without taking space from the number.
// A tiny line for a card: just the shape of the values, green when it ends at
// or above where it started and red when below. No axes or numbers.
function Sparkline({ values, large = false }) {
  const width = large ? 200 : 84
  const height = large ? 40 : 32
  const pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    height - pad - ((v - min) / range) * (height - pad * 2)
  ])
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  const color = up ? '#10b981' : '#ef4444'
  const [lastX, lastY] = points[points.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
      <path d={`${line} L${lastX.toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}

const PART_DOT = { blue: 'bg-blue-500', violet: 'bg-violet-500' }

// What a card's figure is made of, each part a link to the page behind it,
// with a thin bar showing how the total splits when every part is a plain
// positive amount. Amounts are masked with the card's.
function Parts({ parts, hidden }) {
  const total = parts.reduce((sum, p) => sum + (p.value > 0 ? p.value : 0), 0)
  const showBar = total > 0 && parts.every((p) => typeof p.value === 'number' && p.value >= 0)
  return (
    <div className="mt-3 border-t border-gray-100 pt-2.5 dark:border-gray-700">
      {showBar && (
        <div className="mb-2 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700" aria-hidden="true">
          {parts.map((p) => (
            <div key={p.label} className={PART_DOT[p.color] || 'bg-gray-400'} style={{ width: `${(p.value / total) * 100}%` }} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {parts.map((p) => (
          <Link key={p.label} href={p.href} className="group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-700/60">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className={`h-2 w-2 shrink-0 rounded-full ${PART_DOT[p.color] || 'bg-gray-400'}`} /> {p.label}
                {showBar && !hidden && <span className="text-gray-400 dark:text-gray-500">· {Math.round((p.value / total) * 100)}%</span>}
              </p>
              {p.amount !== undefined && (
                <p className="mt-0.5 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {hidden ? <span className="tracking-widest text-gray-400 dark:text-gray-500">••••••</span> : p.amount}
                </p>
              )}
            </div>
            <ChevronRight size={16} className="shrink-0 text-gray-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-300" />
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function SummaryCard({
  label, value, hint, icon: Icon, color = 'slate', change, changeUnit = '%', children, spark,
  maskable = false, hidden = false, onToggleHidden, className = '', hero = false, parts
}) {
  const sparkValues = spark && spark.length > 1 ? spark : null
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl bg-white ${hero ? 'p-4' : 'p-3.5'} shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${COLOR_STYLES[color]}`}>
              <Icon size={13} strokeWidth={2.5} />
            </div>
          )}
          <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
        </div>
        {maskable && (
          <button
            onClick={onToggleHidden}
            aria-label={hidden ? 'Show amount' : 'Hide amount'}
            className="shrink-0 cursor-pointer text-gray-300 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
          >
            {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
        {children ?? (hidden ? (
          // Six dots, one per space, in place of the figure: always the same
          // number, so the amount's size isn't given away. The currency symbol stays.
          <p className={`mt-1.5 flex items-center gap-2 font-semibold text-gray-400 dark:text-gray-500 ${hero ? 'text-2xl' : 'text-lg'}`} aria-label="Amount hidden">
            <span aria-hidden="true">{String(value).match(/^[^\d-]*/)[0].trim()}</span>
            <span aria-hidden="true" className="flex select-none items-center gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="h-2 w-2 rounded-full bg-current" />
              ))}
            </span>
          </p>
        ) : (
          <p title={value} className={`mt-1.5 truncate font-semibold text-gray-900 dark:text-gray-100 ${hero ? 'text-2xl tracking-tight' : 'text-lg'}`}>{value}</p>
        ))}
        </div>
        {sparkValues && <div className="mb-0.5 hidden sm:block"><Sparkline values={sparkValues} large={hero} /></div>}
      </div>
      {/* A percentage change gives no amount away, so it stays visible when
          the amount itself is masked. */}
      {((hint && !hidden) || (change !== undefined && change !== null)) && (
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          {hint && !hidden && <p className="truncate text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
          {change !== undefined && change !== null && (
            <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs font-medium ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {change > 0 ? '+' : change < 0 ? '−' : ''}{Math.abs(change)}{changeUnit}
            </span>
          )}
        </div>
      )}
      {parts && parts.length > 0 && <Parts parts={parts} hidden={hidden} />}
    </div>
  )
}
