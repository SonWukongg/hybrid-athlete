import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Runs on every request. Refreshes the auth session token and enforces route guards.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Avoid crashing middleware in environments where Supabase vars are missing.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase env vars in middleware')
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          // Write refreshed cookies onto both the request and the response
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  try {
    // getUser() triggers a token refresh — do not remove
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (error) {
    console.error('Supabase middleware auth check failed', error)
    return supabaseResponse
  }

  const path = request.nextUrl.pathname

  // Pages that don't require a login
  const isPublicPath = path.startsWith('/login') || path.startsWith('/signup')
  // Not logged in → send to login (except public pages and onboarding redirect is handled in layout)
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Logged in → don't let them see login/signup again
  if (user && isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
