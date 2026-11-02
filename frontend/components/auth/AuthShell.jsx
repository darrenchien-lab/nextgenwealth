import { LineChart, Wallet, TrendingUp, Target, ShieldCheck } from 'lucide-react'

const FEATURES = [
  { icon: Wallet, title: 'Every account in one place', text: 'Banks, e-wallets and cards, in any currency, with net worth by budget cycle.' },
  { icon: TrendingUp, title: 'Investments that price themselves', text: 'Stocks, ETFs and crypto update daily from the market, with your real return.' },
  { icon: Target, title: 'Goals you can actually reach', text: 'See how much to save each month and whether you are on track.' }
]

// The frame for every sign-in page (log in, register, password reset, email
// verification): the form on the right, and on wide screens a brand panel on
// the left saying what the app does. On phones only the form shows.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <aside className="relative hidden w-[46%] max-w-2xl overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-800 to-gray-900 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-300/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <LineChart className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">NextGen Wealth</span>
        </div>

        <div className="relative my-auto max-w-md py-12">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Your whole financial picture, in one place.</h2>
          <p className="mt-3 text-emerald-100/80">Track spending, net worth and investments together, and know where you stand every budget cycle.</p>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title: featureTitle, text }) => (
              <li key={featureTitle} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-5 w-5 text-emerald-200" />
                </div>
                <div>
                  <p className="font-medium">{featureTitle}</p>
                  <p className="mt-0.5 text-sm text-emerald-100/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-sm text-emerald-100/70">
          <ShieldCheck className="h-4 w-4" /> Your data stays private and is never shared.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <LineChart className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">NextGen Wealth</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
