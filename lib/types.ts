// Shared TypeScript types — mirror the Supabase schema so the compiler
// catches mismatches before they reach the database.

export type Profile = {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export type AthleteProfile = {
  id: string
  user_id: string
  crossfit_level: 'beginner' | 'intermediate' | 'advanced' | 'rx' | null
  lifting_level: 'beginner' | 'intermediate' | 'advanced' | 'competitive' | null
  running_level: 'beginner' | 'intermediate' | 'advanced' | 'sub-elite' | null
  typical_training_days: number[]   // 0=Sun, 1=Mon … 6=Sat
  typical_session_duration_mins: number
  primary_goal: string | null
  injuries: object[]
  notes: string | null
}

export type BenchmarkLift = {
  id: string
  user_id: string
  lift_name: string
  weight_kg: number
  recorded_at: string   // YYYY-MM-DD
  notes: string | null
}

export type Session = {
  id: string
  user_id: string
  weekly_plan_id: string | null
  block_id: string | null
  title: string
  session_type: 'crossfit' | 'olympic_lifting' | 'run' | 'strength' | 'rest' | 'active_recovery'
  priority: 'key' | 'standard' | 'optional'
  scheduled_date: string
  scheduled_time: string | null
  duration_mins: number | null
  status: 'scheduled' | 'completed' | 'skipped' | 'moved' | 'cancelled'
  ai_rationale: string | null
  completion_notes: string | null
  perceived_exertion: number | null
  original_date: string | null
}

export type TrainingBlock = {
  id: string
  user_id: string
  title: string
  goal: string
  sport_focus: string[]
  duration_weeks: number
  start_date: string
  end_date: string   // generated column — never write to this
  status: 'draft' | 'active' | 'paused' | 'completed'
  ai_block_plan: object
}

export type CalendarEvent = {
  id: string
  user_id: string
  title: string
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: 'work' | 'social' | 'travel' | 'family' | 'other'
  flexibility: 'fixed' | 'flexible' | 'unknown'
  impact_on_training: 'none' | 'morning_blocked' | 'evening_blocked' | 'full_day_blocked' | 'energy_impact'
  notes: string | null
  triggered_reschedule: boolean
}
