import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Onboarding layout — auth-gated but NO athlete_profile check (would cause a loop)
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <div className="auth-bg min-h-screen">{children}</div>
}
