'use client'

import { useEffect, useState } from 'react'
import { request } from '@/lib/apiClient'

// Sent (from Settings) when the person changes their name, so every place
// that shows it updates without a reload.
export const PROFILE_EVENT = 'nextgen:profile-updated'

// Morning, afternoon or evening by the local clock.
export function greetingFor(date) {
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

// The signed-in person: their email, the name to show, and the current
// greeting. `profile` is null until it has loaded; `greeting` is empty until
// the page is on the client, so server and browser render the same thing.
export function useProfile() {
  const [profile, setProfile] = useState(null)
  const [now, setNow] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await request('/auth/me')
        if (!cancelled) setProfile(data.user)
      } catch {
        // Everything that shows the name just stays generic.
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

  const name = profile ? (profile.displayName || nameFromEmail(profile.email)) : ''
  return { profile, name, email: profile?.email || '', greeting: now ? greetingFor(now) : '' }
}
