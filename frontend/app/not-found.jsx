import Link from 'next/link'

// Shown for an address that does not exist.
export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
      <p className="text-4xl font-semibold text-emerald-600 dark:text-emerald-400">404</p>
      <h1 className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">Page not found</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">The page you are looking for does not exist or has moved.</p>
      <Link href="/dashboard" className="mt-5 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
        Go to Dashboard
      </Link>
    </div>
  )
}
