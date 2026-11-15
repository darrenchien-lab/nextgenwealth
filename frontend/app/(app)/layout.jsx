'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/apiClient'
import Sidebar from '@/components/Sidebar'
import HelpAssistant from '@/components/HelpAssistant'

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
      <main className="relative min-w-0 flex-1 p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <HelpAssistant />
    </div>
  )
}
