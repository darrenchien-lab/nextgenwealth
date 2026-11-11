'use client'

import { useState } from 'react'
import { AlertCircle, AlertTriangle, Loader2, X } from 'lucide-react'
import { request, setToken } from '@/lib/apiClient'
import PasswordField from '@/components/auth/PasswordField'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ErrorBox({ message }) {
  if (!message) return null
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </div>
  )
}

// Changes the password. The server signs out every other device and returns a
// fresh token, which replaces this device's so it stays signed in.
export function ChangePasswordModal({ onClose, onChanged }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const nextError = touched && next.length < 8 ? 'Use at least 8 characters.' : ''
  const confirmError = touched && confirm !== next ? 'Passwords don’t match.' : ''

  async function submit(e) {
    e.preventDefault()
    setTouched(true)
    setError('')
    if (!current || next.length < 8 || confirm !== next) return
    setSaving(true)
    try {
      const data = await request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) })
      setToken(data.token)
      onChanged()
    } catch (err) {
      setError(err.message || 'Could not change the password')
      setSaving(false)
    }
  }

  return (
    <Modal title="Change password" onClose={onClose}>
      <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">You&apos;ll stay signed in here. Any other device will be signed out.</p>
      <form onSubmit={submit} className="space-y-4">
        <PasswordField id="current-password" label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <PasswordField id="new-password" label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" error={nextError} />
        <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={confirmError} />
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Update password
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Permanently deletes the account and everything in it, after the password
// is entered again.
export function DeleteAccountModal({ onClose, onDeleted }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!password) {
      setError('Enter your password to confirm.')
      return
    }
    setDeleting(true)
    try {
      await request('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) })
      onDeleted()
    } catch (err) {
      setError(err.message || 'Could not delete the account')
      setDeleting(false)
    }
  }

  return (
    <Modal title="Delete your account?" onClose={onClose}>
      <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>This permanently deletes your accounts, transactions, investments, budgets and goals. It can&apos;t be undone.</p>
      </div>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <PasswordField id="delete-password" label="Enter your password to confirm" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
          <button type="submit" disabled={deleting} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Delete everything
          </button>
        </div>
      </form>
    </Modal>
  )
}
