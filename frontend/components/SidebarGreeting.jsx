'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { request } from '@/lib/apiClient'
import ThemeToggle from '@/components/ThemeToggle'

export const PROFILE_EVENT = 'nextgen:profile-updated'

// Morning, afternoon or evening by the local clock.
function greetingFor(date) {
  const hour = date.getHours()
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// A name to use when none is set: the part of the email before the @, with
// digits and separators dropped ("darren.chien88@x.com" → "Darren").
function nameFromEmail(email) {
  const first = String(email || '').split('@')[0].split(/[^a-zA-Z]+/).find(Boolean)
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : ''
}

// The app greeting the person by name, in place of the product name at the top
// of the sidebar: a round avatar with their initial, "Good evening," and the
// name. Clicking it opens Settings, where the name is set.
export default function SidebarGreeting() {
  const [profile, setProfile] = useState(null)
  const [now, setNow] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await request('/auth/me')
        if (!cancelled) setProfile(data.user)
      } catch {
        // The greeting just stays generic.
      }
    }
    function onUpdated(event) {
      setProfile((current) => (current ? { ...current, ...event.detail } : current))
    }
    function init() {
      setNow(new Date())
      load()
    }
    init()
    window.addEventListener(PROFILE_EVENT, onUpdated)
    // Re-check the time of day every few minutes so it turns from morning to afternoon by itself.
    const timer = setInterval(() => setNow(new Date()), 5 * 60 * 1000)
    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_EVENT, onUpdated)
      clearInterval(timer)
    }
  }, [])

  const name = profile?.displayName || nameFromEmail(profile?.email)
  const initial = (name || '?').charAt(0).toUpperCase()

  return (
    <div className="mx-3 my-4 flex items-center gap-1">
      <Link href="/settings" title="Your profile and settings" className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-base font-semibold text-white shadow-sm ring-2 ring-white/10">
          {profile ? initial : ''}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-400">{now ? `${greetingFor(now)},` : ' '}</p>
          <p className="truncate text-base font-semibold leading-tight text-white">{profile ? (name || 'there') : <span className="inline-block h-4 w-24 animate-pulse rounded bg-white/10" />}</p>
        </div>
      </Link>
      <ThemeToggle variant="sidebar" />
    </div>
  )
}
