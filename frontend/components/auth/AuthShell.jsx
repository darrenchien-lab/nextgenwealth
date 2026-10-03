import { LineChart } from 'lucide-react'

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <LineChart className="h-6 w-6" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">NextGen Wealth</span>
        </div>

        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-xl shadow-gray-200/60">
          <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
          {subtitle && <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          {children}
        </div>

        {footer && <div className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">{footer}</div>}
      </div>
    </div>
  )
}
