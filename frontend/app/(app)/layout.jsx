'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/apiClient'
import Sidebar from '@/components/Sidebar'
import ThemeToggle from '@/components/ThemeToggle'

export default function AppLayout({ children }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    function init() {
      if (!getToken()) {
        router.replace('/login')
        return
      }
      setChecked(true)
    }
    init()
  }, [router])

  if (!checked) return null

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <main className="relative flex-1 p-8">
        <div className="fixed right-6 top-6 z-40">
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
