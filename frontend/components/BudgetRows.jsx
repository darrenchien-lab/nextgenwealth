import { formatCurrency } from '@/lib/format'

// A budget is fine until it nears its limit: green, then amber from 80%, red
// once it is passed.
const barColor = (percent) => (percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500')
const textColor = (percent) => (percent >= 100 ? 'text-red-600 dark:text-red-400' : percent >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400')

// How each category's budget is doing: spent against its limit, as a bar.
// Fullest first, so the ones that need a look are at the top.
export default function BudgetRows({ budgets, categories }) {
  const names = new Map((categories || []).map((c) => [c.id, c.name]))
  const rows = (budgets || [])
    .map((b) => {
      const limit = Number(b.limit_amount)
      const spent = Number(b.spent)
      return { id: b.id, name: names.get(b.category_id) || 'Category', currency: b.currency, limit, spent, percent: limit > 0 ? Math.round((spent / limit) * 100) : 0 }
    })
    .sort((a, b) => b.percent - a.percent)

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{row.name}</span>
            <span className={`shrink-0 text-xs font-semibold ${textColor(row.percent)}`}>{row.percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div className={`h-full rounded-full ${barColor(row.percent)}`} style={{ width: `${Math.min(100, row.percent)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {row.spent > row.limit
              ? <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(row.spent - row.limit, row.currency)} over</span>
              : <>{formatCurrency(row.limit - row.spent, row.currency)} left</>}
            <span className="text-gray-400 dark:text-gray-500"> · {formatCurrency(row.spent, row.currency)} of {formatCurrency(row.limit, row.currency)}</span>
          </p>
        </li>
      ))}
    </ul>
  )
}
