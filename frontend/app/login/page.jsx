'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Loader2, AlertCircle, Clock, MailWarning } from 'lucide-react'
import { request, setToken, getToken } from '@/lib/apiClient'
import AuthShell from '@/components/auth/AuthShell'
import TextField from '@/components/auth/TextField'
import PasswordField from '@/components/auth/PasswordField'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendStatus, setResendStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function init() {
      // Already signed in: straight to the app. Sent here because a session
      // ran out: say so, instead of a bare login form.
      if (getToken()) {
        router.replace('/dashboard')
        return
      }
      const params = new URLSearchParams(window.location.search)
      if (params.get('expired')) setNotice('Your session has ended. Log in again to continue.')
      const remembered = window.localStorage.getItem('nextgen_last_email')
      if (remembered) setEmail(remembered)
    }
    init()
  }, [router])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setNeedsVerification(false)
    setResendStatus('')
    setSubmitting(true)
    try {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, rememberMe })
      })
      setToken(data.token)
      try {
        if (rememberMe) window.localStorage.setItem('nextgen_last_email', email.trim())
        else window.localStorage.removeItem('nextgen_last_email')
      } catch {
        // Storage can be blocked; remembering the email is only a convenience.
      }
      router.push('/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to log in')
      if (err.code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true)
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setResendStatus('sending')
    try {
      await request('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() })
      })
    } catch {
      // Same answer either way, so the form can't reveal which emails exist.
    }
    setResendStatus('sent')
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to see where your money stands."
      footer={
        <>
          New to NextGen Wealth?{' '}
          <Link href="/register" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            Create an account
          </Link>
        </>
      }
    >
      {notice && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-900/20 dark:text-blue-300">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
        <TextField
          id="email"
          label="Email"
          icon={Mail}
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          id="password"
          label="Password"
          labelAction={
            <Link href="/forgot-password" className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">
              Forgot password?
            </Link>
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
        />

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-900"
          />
          Keep me signed in for 30 days
        </label>

        {error && !needsVerification && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {needsVerification && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="flex items-start gap-2.5"><MailWarning className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>
            <div className="mt-2 pl-[26px]">
              {resendStatus === 'sent' ? (
                <p>A new link is on its way — check your inbox and spam folder.</p>
              ) : (
                <button type="button" onClick={handleResend} disabled={resendStatus === 'sending'} className="font-medium underline disabled:opacity-50">
                  {resendStatus === 'sending' ? 'Sending…' : 'Resend verification email'}
                </button>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthShell>
  )
}
