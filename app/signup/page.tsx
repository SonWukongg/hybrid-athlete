'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    // signUp triggers the handle_new_user DB trigger → creates profiles row automatically
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) { setError(error.message); setLoading(false) }
    else setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="auth-bg min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-ink-black-900 border border-ink-black-700/50 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-cornsilk-500/10 border border-cornsilk-500/30
                          flex items-center justify-center mx-auto mb-4 text-2xl">✉️</div>
          <h2 className="font-display text-xl font-bold text-ink-black-50 mb-2">Check your inbox</h2>
          <p className="text-ash-grey-500 text-sm leading-relaxed">
            Confirmation link sent to{' '}
            <span className="text-cerulean-300 font-medium">{email}</span>.
          </p>
          <div className="mt-6 pt-4 border-t border-ink-black-700/40">
            <Link href="/login" className="text-sm text-cerulean-400 hover:text-cerulean-300 transition-colors">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-ink-black-900 border border-ink-black-700/50 rounded-2xl p-8 shadow-2xl">

        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-ink-black-50">
            Hybrid<span className="text-cerulean-400"> Athlete</span>
          </h1>
          <p className="text-ash-grey-500 text-sm mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-5">
          {[
            { label: 'Full name', type: 'text',     value: fullName, onChange: setFullName, placeholder: 'Alex Johnson' },
            { label: 'Email',     type: 'email',    value: email,    onChange: setEmail,    placeholder: 'you@example.com' },
            { label: 'Password',  type: 'password', value: password, onChange: setPassword, placeholder: 'Min. 6 characters' },
          ].map(({ label, type, value, onChange, placeholder }) => (
            <div key={label}>
              <label className="block text-xs font-semibold uppercase tracking-widest text-ash-grey-500 mb-2">{label}</label>
              <input type={type} required minLength={type === 'password' ? 6 : undefined}
                value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className="w-full px-4 py-2.5 rounded-lg bg-ink-black-800 border border-ink-black-700/60
                           text-ink-black-100 placeholder-ash-grey-700 text-sm
                           focus:outline-none focus:ring-2 focus:ring-cerulean-500 focus:border-transparent transition" />
            </div>
          ))}

          {error && <p className="text-cornsilk-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-cerulean-500 hover:bg-cerulean-400
                       text-ink-black-950 font-semibold text-sm tracking-wide
                       transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div className="my-6 border-t border-ink-black-700/40" />
        <p className="text-center text-sm text-ash-grey-600">
          Have an account?{' '}
          <Link href="/login" className="text-cerulean-400 hover:text-cerulean-300 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
