'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { request, setToken } from '@/lib/apiClient'
import AuthShell from '@/components/auth/AuthShell'
import PasswordField from '@/components/auth/PasswordField'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendStatus, setResendStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNeedsVerification(false)
    setResendStatus('')
    setSubmitting(true)
    try {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      })
      setToken(data.token)
      router.push('/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to log in')
      if (err.code === 'EMAIL_NOT_VERIFIED') setNeedsVerification(true)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setResendStatus('sending')
    try {
      await request('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email })
      })
      setResendStatus('sent')
    } catch {
      setResendStatus('sent')
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          No account?{' '}
          <Link href="/register" className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
            Register
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <Link href="/forgot-password" className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {needsVerification && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800">
            {resendStatus === 'sent' ? (
              <p>If that account needs verifying, a new link has been sent — check your inbox.</p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendStatus === 'sending'}
                className="font-medium underline disabled:opacity-50"
              >
                {resendStatus === 'sending' ? 'Sending...' : 'Resend verification email'}
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </AuthShell>
  )
}
