'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MailCheck, ShieldCheck } from 'lucide-react'
import { request } from '@/lib/apiClient'
import AuthShell from '@/components/auth/AuthShell'
import PasswordField from '@/components/auth/PasswordField'
import PasswordStrength from '@/components/auth/PasswordStrength'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to register')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title={success ? 'Check your inbox' : 'Create your account'}
      subtitle={success ? undefined : 'Start tracking your net worth, spending, and investments in one place.'}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {success ? (
        <div className="space-y-3 text-center">
          <MailCheck className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We sent a verification link to <span className="font-medium text-gray-900 dark:text-gray-100">{email}</span>. Click it to activate your account, then log in.
          </p>
        </div>
      ) : (
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
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
            <PasswordStrength password={password} />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">At least 8 characters</p>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Creating account...' : 'Create account'}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Your data stays private and is never shared.
          </p>
        </form>
      )}
    </AuthShell>
  )
}
