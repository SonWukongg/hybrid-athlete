import { createClient } from '@/lib/supabase/server'
import WeeklyCalendar from '@/components/WeeklyCalendar'
import GeneratePlanButton from '@/components/GeneratePlanButton'
import { Session } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch the active training block
  const { data: activeBlock } = await supabase
    .from('training_blocks')
    .select('id, start_date, duration_weeks, title, goal')
    .eq('user_id', user!.id)
    .eq('status', 'active')
    .maybeSingle()

  // Fetch all sessions for the active block (pre-load so client can scroll freely)
  const { data: sessions } = activeBlock
    ? await supabase
        .from('sessions')
        .select('*')
        .eq('block_id', activeBlock.id)
        .order('scheduled_date', { ascending: true })
    : { data: [] }

  const hasBlock = !!activeBlock

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {hasBlock && activeBlock && (
        <div className="mb-8">
          <p className="text-ash-grey-600 text-xs uppercase tracking-widest font-semibold mb-1">
            Active block
          </p>
          <h1 className="font-display text-3xl font-bold text-ink-black-50">{activeBlock.title}</h1>
          <p className="text-ash-grey-600 text-sm mt-1">{activeBlock.goal}</p>
        </div>
      )}

      {!hasBlock && (
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-ink-black-50">Dashboard</h1>
        </div>
      )}

      <WeeklyCalendar
        sessions={(sessions as Session[]) ?? []}
        blockStart={activeBlock?.start_date ?? null}
        blockDurationWeeks={activeBlock?.duration_weeks ?? null}
      />

      {!hasBlock && <GeneratePlanButton userId={user!.id} />}
    </div>
  )
}
