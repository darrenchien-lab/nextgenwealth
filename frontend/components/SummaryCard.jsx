import { TrendingUp, TrendingDown, Eye, EyeOff } from 'lucide-react'

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
export default function SummaryCard({
  label, value, hint, icon: Icon, color = 'slate', change, children,
  maskable = false, hidden = false, onToggleHidden
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
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
      {children ?? (
        <p title={hidden ? undefined : value} className="mt-2 truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
          {hidden ? '••••••••' : value}
        </p>
      )}
      {(hint || (change !== undefined && change !== null)) && !hidden && (
        <div className="mt-0.5 flex items-center gap-1.5">
          {hint && <p className="truncate text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
          {change !== undefined && change !== null && (
            <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs font-medium ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {Math.abs(change)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}
