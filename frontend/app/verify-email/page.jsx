'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { request } from '@/lib/apiClient'
import AuthShell from '@/components/auth/AuthShell'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState('verifying')
  const [error, setError] = useState('')

  useEffect(() => {
    function init() {
      if (!token) {
        setStatus('error')
        setError('This link is missing a verification token.')
        return
      }
      request('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token })
      })
        .then(() => setStatus('success'))
        .catch((err) => {
          setStatus('error')
          setError(err.message || 'Failed to verify email')
        })
    }
    init()
  }, [token])

  return (
    <AuthShell
      title="Email verification"
      footer={
        <Link href="/login" className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
          Back to log in
        </Link>
      }
    >
      {status === 'verifying' && <p className="text-sm text-gray-500 dark:text-gray-400">Verifying your email...</p>}
      {status === 'success' && (
        <p className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          Your email has been verified. You can now log in.
        </p>
      )}
      {status === 'error' && <p className="rounded-lg bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </AuthShell>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  )
}
