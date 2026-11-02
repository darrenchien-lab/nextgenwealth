'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, MailCheck, Loader2, AlertCircle } from 'lucide-react'
import { request, getToken } from '@/lib/apiClient'
import AuthShell from '@/components/auth/AuthShell'
import TextField from '@/components/auth/TextField'
import PasswordField from '@/components/auth/PasswordField'
import PasswordStrength from '@/components/auth/PasswordStrength'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resendStatus, setResendStatus] = useState('')

  useEffect(() => {
    function init() {
      if (getToken()) router.replace('/dashboard')
    }
    init()
  }, [router])

  // Field problems show once the user has tried to submit, not while typing.
  const emailError = touched && !EMAIL_PATTERN.test(email.trim()) ? 'Enter a valid email address.' : ''
  const passwordError = touched && password.length < 8 ? 'Use at least 8 characters.' : ''
  const confirmError = (touched || confirm.length >= password.length) && confirm && confirm !== password
    ? 'Passwords don’t match.'
    : touched && !confirm ? 'Type your password again.' : ''

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched(true)
    setError('')
    if (!EMAIL_PATTERN.test(email.trim()) || password.length < 8 || confirm !== password) return
    setSubmitting(true)
    try {
      await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password })
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to create your account')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setResendStatus('sending')
    try {
      await request('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: email.trim() }) })
    } catch {
      // Same answer either way, so the form can't reveal which emails exist.
    }
    setResendStatus('sent')
  }

  if (success) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="One more step to activate your account."
        footer={<Link href="/login" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Back to log in</Link>}
      >
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
            <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            We sent a verification link to <span className="font-medium text-gray-900 dark:text-gray-100">{email.trim()}</span>. Open it to activate your account, then log in.
          </p>
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
            Didn’t get it? Check your spam folder, or{' '}
            {resendStatus === 'sent' ? (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">a new link has been sent.</span>
            ) : (
              <button type="button" onClick={handleResend} disabled={resendStatus === 'sending'} className="font-medium text-emerald-600 hover:underline disabled:opacity-50 dark:text-emerald-400">
                {resendStatus === 'sending' ? 'sending…' : 'send it again'}
              </button>
            )}
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to use. Takes less than a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <TextField
          id="email"
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
        <div>
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Create a password"
            error={passwordError}
          />
          <PasswordStrength password={password} />
        </div>
        <PasswordField
          id="confirm"
          label="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="Type it again"
          error={confirmError}
        />

        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {error}
              {/already exists/i.test(error) && <> <Link href="/login" className="font-medium underline">Log in instead</Link></>}
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          We’ll email you a link to confirm it’s you before your account is active.
        </p>
      </form>
    </AuthShell>
  )
}
