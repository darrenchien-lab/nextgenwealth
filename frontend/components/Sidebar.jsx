'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Wallet, ArrowLeftRight, PiggyBank, Receipt,
  Target, TrendingUp, FileBarChart, Sparkles, Settings, LogOut, LineChart
} from 'lucide-react'
import { request, clearToken } from '@/lib/apiClient'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank },
  { href: '/bills', label: 'Bills', icon: Receipt },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/investments', label: 'Investments', icon: TrendingUp },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  { href: '/insights', label: 'Insights', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings }
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    try {
      await request('/auth/logout', { method: 'POST' })
    } catch {
      // Even if the server call fails, still clear the local session below.
    }
    clearToken()
    router.push('/login')
  }

  return (
    <aside className="w-60 flex-shrink-0 bg-slate-900">
      <div className="sticky top-0 flex h-screen flex-col justify-between overflow-y-auto">
        <div>
          <div className="flex items-center gap-2 px-5 py-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
              <LineChart className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold text-white">NextGen Wealth</span>
          </div>
          <nav className="flex flex-col gap-1 px-3">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="border-t border-white/10 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} strokeWidth={2} />
            Log out
          </button>
        </div>
      </div>
    </aside>
  )
}
