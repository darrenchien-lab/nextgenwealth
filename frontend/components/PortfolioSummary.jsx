import { ArrowDownRight, ArrowUpRight, Landmark, Layers, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

// "Today 17:02", "Yesterday 17:00" or "12 Oct, 17:00".
function formatUpdatedAt(value) {
  const d = new Date(value)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return `Today ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`
}

// The portfolio at a glance: what it's worth now, the unrealized P&L on what
// was paid for it, and the figures behind that.
export default function PortfolioSummary({ portfolio }) {
  const currency = portfolio.displayCurrency
  const gain = portfolio.totalUnrealizedGain
  const percent = portfolio.totalCostBasis > 0 ? Math.round((gain / portfolio.totalCostBasis) * 1000) / 10 : null
  const up = gain >= 0
  const openHoldings = portfolio.holdings.filter((h) => Number(h.quantity) > 0)
  const updates = openHoldings.map((h) => h.price_updated_at).filter(Boolean).sort()
  const lastUpdate = updates.length > 0 ? updates[updates.length - 1] : null
  const Arrow = up ? ArrowUpRight : ArrowDownRight

  const stat = (Icon, label, value) => (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Icon size={14} className="text-gray-400 dark:text-gray-500" /> {label}
      </span>
      <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  )

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
      <div className={`h-1 ${up ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Portfolio value</p>
          <p className="mt-1 truncate text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {formatCurrency(portfolio.totalValue, currency)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${up ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              <Arrow size={15} strokeWidth={2.5} />
              {up ? '+' : '−'}{formatCurrency(Math.abs(gain), currency)}
              {percent !== null && <span className="font-medium opacity-80">· {up ? '+' : '−'}{Math.abs(percent)}%</span>}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">Unrealized P&amp;L</span>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3 border-t border-gray-100 pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0 dark:border-gray-700">
          {stat(Landmark, 'Capital invested', formatCurrency(portfolio.totalCostBasis, currency))}
          {stat(Layers, 'Holdings', openHoldings.length)}
          {stat(Clock, 'Prices updated', lastUpdate ? formatUpdatedAt(lastUpdate) : 'Manual')}
        </div>
      </div>
    </div>
  )
}
