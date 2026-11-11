'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, CalendarDays, Check, Coins, EyeOff, KeyRound, Loader2, LogOut, Moon, Palette, Sun, Trash2, UserRound } from 'lucide-react'
import { request, clearToken } from '@/lib/apiClient'
import { getPreferredTheme, setTheme as persistTheme } from '@/lib/theme'
import { getHideAmountsDefault, setHideAmountsDefault } from '@/lib/preferences'
import ConfirmDialog from '@/components/ConfirmDialog'
import DayOfMonthPicker from '@/components/DayOfMonthPicker'
import { ChangePasswordModal, DeleteAccountModal } from '@/components/account/AccountModals'

const COMMON_CURRENCIES = ['IDR', 'USD', 'TWD', 'SGD', 'MYR', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD']

const currencyName = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) || code
  } catch {
    return code
  }
}

const ordinal = (n) => {
  const rest = n % 100
  if (rest >= 11 && rest <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`
}

// The budget cycle (start → end, both included) containing today when it
// starts on `day` — the same rule the server uses.
function cycleFor(day, today = new Date()) {
  // A start day the month is too short for falls on its last day.
  const startIn = (year, month) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()))
  const thisMonth = startIn(today.getFullYear(), today.getMonth())
  const start = today.getDate() < thisMonth.getDate() ? startIn(today.getFullYear(), today.getMonth() - 1) : thisMonth
  const next = startIn(start.getFullYear(), start.getMonth() + 1)
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1)
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

const CONTROL = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors duration-150 hover:border-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500'
const OPTION = 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100'

// One line in a settings group: what it is on the left, its control on the
// right. `status` is the little "Saved" / error text under the control.
function Row({ icon: Icon, title, description, children, status }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="flex min-w-0 gap-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-300">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          <p className="mt-0.5 max-w-md text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      <div className="shrink-0 sm:w-64">
        {children}
        {status}
      </div>
    </div>
  )
}

function Status({ saved, error }) {
  if (error) return <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
  if (saved) return <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check size={13} /> Saved</p>
  return null
}

function Group({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{title}</h2>
      {/* No overflow-hidden: a picker's popover has to be able to extend past the card. */}
      <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:divide-gray-700 dark:bg-gray-800 dark:ring-gray-700">
        {children}
      </div>
    </section>
  )
}

// A select that shows a Save button only once its value differs from what's
// saved, so nothing changes by accident. These two settings reshape every
// page, which is why they aren't saved the moment they are picked.
function SavedSelect({ value, saved, onChange, onSave, saving, loading, options, control }) {
  if (loading) return <div className="h-9 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
  const changed = String(value) !== String(saved)
  return (
    <div className="flex items-center gap-2">
      {control || (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${CONTROL} min-w-0 flex-1`}>
          {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue} className={OPTION}>{label}</option>)}
        </select>
      )}
      {changed && (
        <button
          onClick={onSave}
          disabled={saving}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {saving ? 'Saving' : 'Save'}
        </button>
      )}
    </div>
  )
}

const BUTTON = 'rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors duration-150 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

function Switch({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${checked ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-150 ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const [currentCurrency, setCurrentCurrency] = useState('')
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const [currencyLoading, setCurrencyLoading] = useState(true)
  const [currencyError, setCurrencyError] = useState('')
  const [currencySaved, setCurrencySaved] = useState(false)
  const [currencySaving, setCurrencySaving] = useState(false)

  const [currentCycleDay, setCurrentCycleDay] = useState(1)
  const [selectedCycleDay, setSelectedCycleDay] = useState(1)
  const [cycleLoading, setCycleLoading] = useState(true)
  const [cycleError, setCycleError] = useState('')
  const [cycleSaved, setCycleSaved] = useState(false)
  const [cycleSaving, setCycleSaving] = useState(false)

  const [theme, setThemeState] = useState(null)
  const [hideDefault, setHideDefault] = useState(false)
  const [me, setMe] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    async function loadCurrency() {
      try {
        const data = await request('/accounts/display-currency')
        setCurrentCurrency(data.displayCurrency)
        setSelectedCurrency(data.displayCurrency)
      } catch (err) {
        setCurrencyError(err.message || 'Failed to load this setting')
      } finally {
        setCurrencyLoading(false)
      }
    }
    async function loadCycle() {
      try {
        const data = await request('/accounts/cycle-start-day')
        setCurrentCycleDay(data.cycleStartDay)
        setSelectedCycleDay(data.cycleStartDay)
      } catch (err) {
        setCycleError(err.message || 'Failed to load this setting')
      } finally {
        setCycleLoading(false)
      }
    }
    async function loadMe() {
      try {
        setMe((await request('/auth/me')).user)
      } catch {
        // The email line just stays empty.
      }
    }
    function init() {
      loadCurrency()
      loadCycle()
      loadMe()
      setThemeState(getPreferredTheme())
      setHideDefault(getHideAmountsDefault())
    }
    init()
  }, [])

  // "Saved" fades after a few seconds.
  useEffect(() => {
    if (!currencySaved) return undefined
    const timer = setTimeout(() => setCurrencySaved(false), 3000)
    return () => clearTimeout(timer)
  }, [currencySaved])
  useEffect(() => {
    if (!cycleSaved) return undefined
    const timer = setTimeout(() => setCycleSaved(false), 3000)
    return () => clearTimeout(timer)
  }, [cycleSaved])

  async function saveCurrency() {
    setCurrencyError('')
    setCurrencySaved(false)
    setCurrencySaving(true)
    try {
      const result = await request('/accounts/display-currency', { method: 'PUT', body: JSON.stringify({ currency: selectedCurrency }) })
      setCurrentCurrency(result.displayCurrency)
      setSelectedCurrency(result.displayCurrency)
      setCurrencySaved(true)
    } catch (err) {
      setCurrencyError(err.message || 'Failed to save the display currency')
    } finally {
      setCurrencySaving(false)
    }
  }

  async function saveCycle() {
    setCycleError('')
    setCycleSaved(false)
    setCycleSaving(true)
    try {
      const result = await request('/accounts/cycle-start-day', { method: 'PUT', body: JSON.stringify({ cycleStartDay: Number(selectedCycleDay) }) })
      setCurrentCycleDay(result.cycleStartDay)
      setSelectedCycleDay(result.cycleStartDay)
      setCycleSaved(true)
    } catch (err) {
      setCycleError(err.message || 'Failed to save the budget cycle start day')
    } finally {
      setCycleSaving(false)
    }
  }

  function chooseTheme(next) {
    setThemeState(next)
    persistTheme(next)
  }

  function chooseHideDefault(next) {
    setHideDefault(next)
    setHideAmountsDefault(next)
  }

  async function signOutEverywhere() {
    setConfirmingSignOut(false)
    try {
      await request('/auth/logout-all', { method: 'POST' })
    } catch {
      // Even if the call fails, this device is signed out below.
    }
    clearToken()
    router.push('/login')
  }

  const currencyCodes = currentCurrency && !COMMON_CURRENCIES.includes(currentCurrency) ? [currentCurrency, ...COMMON_CURRENCIES] : COMMON_CURRENCIES

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">How your money is shown and counted across the app.</p>
      </div>

      <Group title="Preferences">
        <Row
          icon={Coins}
          title="Display currency"
          description="Net worth, the dashboard and reports show combined totals in this currency. Each account still shows in its own."
          status={<Status saved={currencySaved} error={currencyError} />}
        >
          <SavedSelect
            value={selectedCurrency}
            saved={currentCurrency}
            onChange={setSelectedCurrency}
            onSave={saveCurrency}
            saving={currencySaving}
            loading={currencyLoading}
            options={currencyCodes.map((code) => [code, `${code} · ${currencyName(code)}`])}
          />
        </Row>
        <Row
          icon={CalendarDays}
          title="Budget cycle starts on"
          description="Your “month” for the dashboard, budgets, cash flow and reports starts on this day, such as payday, instead of always the 1st."
          status={
            <>
              {!cycleLoading && (
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  {String(selectedCycleDay) === String(currentCycleDay) ? 'Current cycle' : 'Would become'}: <span className="font-medium text-gray-600 dark:text-gray-300">{cycleFor(Number(selectedCycleDay))}</span>
                </p>
              )}
              <Status saved={cycleSaved} error={cycleError} />
            </>
          }
        >
          <SavedSelect
            value={selectedCycleDay}
            saved={currentCycleDay}
            onChange={setSelectedCycleDay}
            onSave={saveCycle}
            saving={cycleSaving}
            loading={cycleLoading}
            control={<DayOfMonthPicker className="min-w-0 flex-1" value={selectedCycleDay} onChange={setSelectedCycleDay} label={`The ${ordinal(Number(selectedCycleDay))} of each month`} />}
          />
        </Row>
      </Group>

      <Group title="Appearance">
        <Row icon={Palette} title="Theme" description="Light or dark. Your choice is remembered on this device.">
          {theme === null ? (
            <div className="h-9 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
          ) : (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900/60" role="radiogroup" aria-label="Theme">
              {[['light', Sun, 'Light'], ['dark', Moon, 'Dark']].map(([key, Icon, label]) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={theme === key}
                  onClick={() => chooseTheme(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors duration-150 ${theme === key ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          )}
        </Row>
      </Group>

      <Group title="Privacy and security">
        <Row
          icon={EyeOff}
          title="Hide amounts by default"
          description="Net worth and balance cards start with their amounts hidden on this device. The eye icon on a card still reveals them."
        >
          <div className="flex justify-end">
            <Switch checked={hideDefault} onChange={chooseHideDefault} label="Hide amounts by default" />
          </div>
        </Row>
        <Row
          icon={KeyRound}
          title="Password"
          description="Change it any time. Other devices are signed out when you do."
          status={passwordChanged ? <p className="mt-2 flex items-center justify-end gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check size={13} /> Password updated</p> : null}
        >
          <div className="flex justify-end">
            <button onClick={() => { setPasswordChanged(false); setShowPassword(true) }} className={BUTTON}>Change password</button>
          </div>
        </Row>
        <Row icon={LogOut} title="Sign out of all devices" description="Ends every session, including this one. Use it if you lost a device or logged in somewhere you shouldn't have.">
          <div className="flex justify-end">
            <button onClick={() => setConfirmingSignOut(true)} className={BUTTON}>Sign out everywhere</button>
          </div>
        </Row>
      </Group>

      <Group title="Account">
        <Row icon={UserRound} title="Signed in as" description="The email you log in with.">
          <div className="flex items-center justify-end gap-2 text-sm">
            {me ? (
              <>
                <span className="truncate font-medium text-gray-900 dark:text-gray-100">{me.email}</span>
                {me.emailVerified && <BadgeCheck size={16} className="shrink-0 text-emerald-500" title="Email verified" />}
              </>
            ) : <div className="h-5 w-40 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />}
          </div>
        </Row>
        <Row icon={Trash2} title="Delete account" description="Permanently deletes your accounts, transactions, investments, budgets and goals. This can't be undone.">
          <div className="flex justify-end">
            <button onClick={() => setShowDelete(true)} className="rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-600 shadow-sm transition-colors duration-150 hover:bg-red-50 dark:border-red-900/60 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30">
              Delete account
            </button>
          </div>
        </Row>
      </Group>

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} onChanged={() => { setShowPassword(false); setPasswordChanged(true) }} />}
      {showDelete && <DeleteAccountModal onClose={() => setShowDelete(false)} onDeleted={() => { clearToken(); router.push('/login?deleted=1') }} />}
      <ConfirmDialog
        open={confirmingSignOut}
        title="Sign out of all devices?"
        message="Every session ends, including this one. You'll need to log in again."
        confirmLabel="Sign out everywhere"
        onConfirm={signOutEverywhere}
        onCancel={() => setConfirmingSignOut(false)}
      />
    </div>
  )
}
