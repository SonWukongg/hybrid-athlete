'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { router.push('/dashboard'); router.refresh() }
  }

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-ink-black-900 border border-ink-black-700/50 rounded-2xl p-8 shadow-2xl">

        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-ink-black-50">
            Hybrid<span className="text-cerulean-400"> Athlete</span>
          </h1>
          <p className="text-ash-grey-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-ash-grey-500 mb-2">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 rounded-lg bg-ink-black-800 border border-ink-black-700/60
                         text-ink-black-100 placeholder-ash-grey-700 text-sm
                         focus:outline-none focus:ring-2 focus:ring-cerulean-500 focus:border-transparent transition" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-ash-grey-500 mb-2">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg bg-ink-black-800 border border-ink-black-700/60
                         text-ink-black-100 placeholder-ash-grey-700 text-sm
                         focus:outline-none focus:ring-2 focus:ring-cerulean-500 focus:border-transparent transition" />
          </div>

          {error && <p className="text-cornsilk-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-cerulean-500 hover:bg-cerulean-400
                       text-ink-black-950 font-semibold text-sm tracking-wide
                       transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="my-6 border-t border-ink-black-700/40" />
        <p className="text-center text-sm text-ash-grey-600">
          No account?{' '}
          <Link href="/signup" className="text-cerulean-400 hover:text-cerulean-300 font-medium transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
