import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Root — immediately redirects based on auth state. No UI rendered here.
export default async function RootPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/login')
}
