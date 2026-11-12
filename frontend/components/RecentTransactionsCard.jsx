import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ArrowLeftRight, Plus, Receipt } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import CardHeader from '@/components/CardHeader'

const dayKey = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "Today", "Yesterday", or "12 Nov".
function relativeDay(value) {
  const key = dayKey(value)
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(yesterday)) return 'Yesterday'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// The latest transactions across everything, with a button to add one without
// leaving the dashboard. Amounts are masked when the dashboard's are.
export default function RecentTransactionsCard({ transactions, accounts, categories, onAdd, hideAmounts = false, cycleLabel = null, seeAllHref = '/transactions', className = '' }) {
  const accountById = new Map((accounts || []).map((a) => [a.id, a]))
  const categoryById = new Map((categories || []).map((c) => [c.id, c.name]))

  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 ${className}`}>
      <CardHeader
        icon={ArrowLeftRight}
        color="blue"
        title={cycleLabel ? 'Transactions' : 'Recent transactions'}
        subtitle={cycleLabel ? `Latest in ${cycleLabel}` : undefined}
        action={
          <div className="flex items-center gap-3">
            <Link href={seeAllHref} className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">Open Transactions</Link>
            <button onClick={onAdd} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors duration-150 hover:bg-emerald-700">
              <Plus size={14} strokeWidth={2.5} /> Add
            </button>
          </div>
        }
      />
      {!transactions || transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Receipt size={24} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400 dark:text-gray-500">{cycleLabel ? 'No transactions in this cycle.' : 'No transactions yet.'}</p>
          {!cycleLabel && <button onClick={onAdd} className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">Add your first one</button>}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-10 lg:grid-cols-2">
          {transactions.map((t) => {
            const income = t.type === 'income'
            const account = accountById.get(t.account_id)
            const category = categoryById.get(t.category_id)
            return (
              <li key={t.id} className="flex items-center gap-3 border-b border-gray-100 py-2 dark:border-gray-700">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${income ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {income ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{t.notes || category || (income ? 'Income' : 'Expense')}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {[category && t.notes ? category : null, account?.name, relativeDay(t.occurred_at)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {hideAmounts ? (
                  <p className="shrink-0 text-sm font-semibold tracking-widest text-gray-400 dark:text-gray-500" aria-label="Amount hidden">••••••</p>
                ) : (
                  <p className={`shrink-0 text-sm font-semibold ${income ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {income ? '+' : '−'}{formatCurrency(Number(t.amount), account?.currency)}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
