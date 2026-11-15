'use client'

import Link from 'next/link'
import { useProfile } from '@/lib/useProfile'
import ThemeToggle from '@/components/ThemeToggle'
import Logo from '@/components/Logo'

export { PROFILE_EVENT } from '@/lib/useProfile'

// The top of the sidebar: a time-of-day greeting with the person's name beside
// the app's logo. Clicking it opens Settings, where the name is set. A hairline
// under it separates it from the menu.
export default function SidebarGreeting() {
  const { profile, name, greeting } = useProfile()

  return (
    <div className="mx-3 mb-2 mt-5 flex items-center gap-1 border-b border-white/5 pb-4">
      <Link
        href="/settings"
        title="Your profile and settings"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-white/5"
      >
        <Logo size={40} />
        <div className="min-w-0">
          {profile ? (
            <>
              <p className="truncate text-xs font-medium text-gray-400">{greeting || ' '}</p>
              <p className="truncate text-[15px] font-semibold leading-snug text-white">{name || 'Welcome'}</p>
            </>
          ) : (
            <div className="space-y-1.5">
              <span className="block h-2.5 w-16 animate-pulse rounded bg-white/10" />
              <span className="block h-3.5 w-24 animate-pulse rounded bg-white/10" />
            </div>
          )}
        </div>
      </Link>
      <ThemeToggle variant="sidebar" />
    </div>
  )
}
