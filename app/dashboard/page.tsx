import { createClient } from '@/lib/supabase/server'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import GeneratePlanButton from '@/components/GeneratePlanButton'
import { Session } from '@/lib/types'

// Dashboard home — server component, fetches this week's sessions before render
export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Check if any training block exists for this user
  const { data: blocks } = await supabase
    .from('training_blocks')
    .select('id')
    .eq('user_id', user!.id)
    .limit(1)

  const hasBlock = blocks && blocks.length > 0

  // Calculate current week Mon–Sun
  const today     = new Date()
  const dayOfWeek = today.getDay()
  const monday    = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const from = monday.toISOString().split('T')[0]
  const to   = sunday.toISOString().split('T')[0]

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', user!.id)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date', { ascending: true })

  const isEmpty = !sessions || sessions.length === 0

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-ink-black-50">This Week</h1>
        <p className="text-ash-grey-600 text-sm mt-1">
          {monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
          <span className="mx-2 text-ink-black-800">—</span>
          {sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <WeeklyCalendar sessions={(sessions as Session[]) ?? []} weekStart={from} />

      {/* No training block at all — show generate button */}
      {!hasBlock && <GeneratePlanButton userId={user!.id} />}

      {/* Has a block but no sessions this week — quiet empty state */}
      {hasBlock && isEmpty && (
        <div className="mt-16 text-center">
          <div className="w-14 h-14 rounded-full bg-cornsilk-500/10 border border-cornsilk-500/20
                          flex items-center justify-center mx-auto mb-4 text-2xl">🏋️</div>
          <p className="font-display text-xl font-semibold text-ink-black-300">No sessions this week</p>
          <p className="text-ash-grey-600 text-sm mt-2 max-w-xs mx-auto">
            Your training block exists but has no sessions scheduled for this week.
          </p>
        </div>
      )}
    </div>
  )
}
