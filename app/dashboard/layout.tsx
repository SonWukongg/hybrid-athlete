import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

// Dashboard layout — server auth gate, onboarding gate, sidebar shell
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  // Redirect if not logged in
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Redirect to onboarding if athlete_profile doesn't exist yet.
  // maybeSingle() returns null (not an error) when no row is found.
  const { data: athleteProfile } = await supabase
    .from('athlete_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!athleteProfile) redirect('/onboarding')

  // Fetch profile for sidebar user strip
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen bg-ink-black-950">
      <Sidebar profile={profile} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
