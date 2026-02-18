import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server-side Supabase client — used in Server Components, Route Handlers, Server Actions
export function createClient() {
  const cookieStore = cookies()
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase configuration. Set SUPABASE_URL/SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.'
    )
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Safe to ignore in read-only Server Component contexts — middleware handles refresh
          }
        },
      },
    }
  )
}
