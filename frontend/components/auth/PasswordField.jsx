'use client'

import { useState } from 'react'
import { Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react'

// Password input with a show/hide toggle and a Caps Lock warning (the most
// common reason a correct password is "wrong"). `labelAction` sits at the
// right of the label row, e.g. a "Forgot password?" link.
export default function PasswordField({ label, labelAction, value, onChange, minLength, required = true, autoComplete, id, error, placeholder }) {
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const checkCaps = (e) => setCapsLock(Boolean(e.getModifierState && e.getModifierState('CapsLock')))

  return (
    <div>
      {(label || labelAction) && (
        <div className="mb-1.5 flex items-center justify-between">
          {label && <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
          {labelAction}
        </div>
      )}
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          value={value}
          onChange={onChange}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={`w-full rounded-lg border bg-white py-2.5 pl-9 pr-10 text-sm text-gray-900 shadow-sm transition-colors duration-150 placeholder:text-gray-400 focus:outline-none focus:ring-2 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500' : 'border-gray-300 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-gray-700'}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {capsLock && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> Caps Lock is on
        </p>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
