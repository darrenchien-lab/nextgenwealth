'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, TriangleAlert } from 'lucide-react'

// What a person sees if a page fails while it is being shown: the menu stays,
// and they can try again or go back to the Dashboard. The technical detail
// goes to the browser console only, never onto the screen.
export default function PageError({ error, retry }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
        <TriangleAlert size={24} />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Something went wrong</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        This page could not be shown. Your data is safe. Try again, and if it keeps happening, go back to the Dashboard.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button onClick={() => retry()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          <RefreshCw size={15} /> Try again
        </button>
        <Link href="/dashboard" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
          Go to Dashboard
        </Link>
      </div>
      {error?.digest && <p className="mt-4 text-[11px] text-gray-400 dark:text-gray-500">Reference: {error.digest}</p>}
    </div>
  )
}
