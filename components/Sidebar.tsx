'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Profile = { full_name: string; email: string; avatar_url: string | null }

// Session type colours using the brand palette — shown in the legend
const SESSION_TYPES: { label: string; color: string }[] = [
  { label: 'CrossFit',         color: 'bg-cerulean-500' },
  { label: 'Olympic Lifting',  color: 'bg-ink-black-400' },
  { label: 'Run',              color: 'bg-tropical-teal-400' },
  { label: 'Strength',         color: 'bg-ash-grey-400' },
  { label: 'Rest',             color: 'bg-ink-black-700' },
  { label: 'Active Recovery',  color: 'bg-tropical-teal-700' },
]

const NAV = [
  { href: '/dashboard',          label: 'This Week' },
  { href: '/dashboard/blocks',   label: 'Training Blocks' },
  { href: '/dashboard/calendar', label: 'Calendar Events' },
  { href: '/dashboard/profile',  label: 'Profile' },
]

export default function Sidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname()
  const router   = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 shrink-0 bg-ink-black-900 border-r border-ink-black-700/50 flex flex-col">

      {/* Wordmark */}
      <div className="px-5 py-6 border-b border-ink-black-700/40">
        <span className="font-display text-lg font-bold text-ink-black-50">
          Hybrid<span className="text-cerulean-400"> Athlete</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? 'bg-cerulean-500/10 text-cerulean-300 border border-cerulean-500/20'
                  : 'text-ash-grey-500 hover:text-ink-black-100 hover:bg-ink-black-800 border border-transparent'}`}>
              {active && <span className="w-1 h-4 rounded-full bg-cerulean-400 -ml-1 shrink-0" />}
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Session type legend */}
      <div className="px-5 py-4 border-t border-ink-black-700/40">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ash-grey-700 mb-3">Session types</p>
        <ul className="space-y-1.5">
          {SESSION_TYPES.map(({ label, color }) => (
            <li key={label} className="flex items-center gap-2 text-xs text-ash-grey-600">
              <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {/* User strip */}
      <div className="px-5 py-4 border-t border-ink-black-700/40">
        <div className="flex items-center gap-3 mb-3">
          {/* Initials avatar with cornsilk accent */}
          <div className="w-7 h-7 rounded-full bg-cornsilk-500/10 border border-cornsilk-500/30
                          flex items-center justify-center shrink-0">
            <span className="text-cornsilk-400 text-xs font-bold font-display">
              {profile?.full_name?.charAt(0).toUpperCase() ?? 'A'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-black-100 truncate">{profile?.full_name ?? 'Athlete'}</p>
            <p className="text-xs text-ash-grey-700 truncate">{profile?.email}</p>
          </div>
        </div>
        <button onClick={signOut}
          className="text-xs text-ash-grey-700 hover:text-ink-black-300 transition-colors">
          Sign out
        </button>
      </div>
    </aside>
  )
}
