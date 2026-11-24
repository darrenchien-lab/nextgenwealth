import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

const MASK = '••••••'

// Three plain facts about the cycle's spending, shown beside the donut: the
// biggest category, what is spent on an average day, and how that compares
// with the same point of the cycle before. Kept to a label and a figure each,
// so all three fit beside the donut. Amounts are masked when the dashboard's are.
export default function ExpenseHighlights({ top, dailyAverage, changeVsLast, currency, hideAmounts = false, className = '' }) {
  const label = 'text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500'
  const value = 'text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100'
  return (
    <dl className={`min-w-0 space-y-2.5 ${className}`}>
      {top && (
        <div title={hideAmounts ? `${top.categoryName}: ${top.percentage}%` : `${top.categoryName}: ${top.percentage}% · ${formatCurrency(top.amount, currency)}`}>
          <dt className={label}>Biggest</dt>
          <dd className={`${value} truncate`}>{top.categoryName}</dd>
        </div>
      )}
      {dailyAverage !== null && (
        <div>
          <dt className={label}>Daily average</dt>
          <dd className={value}>{hideAmounts ? <span className="tracking-widest">{MASK}</span> : formatCurrency(dailyAverage, currency)}</dd>
        </div>
      )}
      {changeVsLast !== null && (
        <div title="Compared with the same point of the cycle before">
          <dt className={label}>Vs last cycle</dt>
          <dd className={`${value} flex items-center gap-1 ${changeVsLast > 0 ? 'text-red-600 dark:text-red-400' : changeVsLast < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
            {changeVsLast > 0 ? <TrendingUp size={14} /> : changeVsLast < 0 ? <TrendingDown size={14} /> : null}
            {changeVsLast > 0 ? '+' : changeVsLast < 0 ? '−' : ''}{Math.abs(changeVsLast)}%
          </dd>
        </div>
      )}
    </dl>
  )
}
