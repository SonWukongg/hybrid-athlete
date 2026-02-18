'use client'

import { Session } from '@/lib/types'

// Pill colours — each session type maps to a brand colour
const TYPE_COLORS: Record<string, string> = {
  crossfit:        'bg-cerulean-500/15 text-cerulean-300 border-cerulean-500/25',
  olympic_lifting: 'bg-ink-black-700/50 text-ink-black-300 border-ink-black-600/40',
  run:             'bg-tropical-teal-500/15 text-tropical-teal-300 border-tropical-teal-500/25',
  strength:        'bg-ash-grey-700/30 text-ash-grey-300 border-ash-grey-600/30',
  rest:            'bg-ink-black-800/60 text-ash-grey-600 border-ink-black-700/30',
  active_recovery: 'bg-tropical-teal-800/40 text-tropical-teal-400 border-tropical-teal-700/30',
}

// Priority dot — cornsilk gold for key sessions
const PRIORITY_DOT: Record<string, string> = {
  key:      'bg-cornsilk-400',
  standard: 'bg-ink-black-600',
  optional: 'bg-ink-black-700',
}

type Props = { sessions: Session[]; weekStart: string }

function buildWeekDays(weekStart: string): string[] {
  const days: string[] = []
  const start = new Date(weekStart)
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export default function WeeklyCalendar({ sessions, weekStart }: Props) {
  const days      = buildWeekDays(weekStart)
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const today      = new Date().toISOString().split('T')[0]

  return (
    <div className="grid grid-cols-7 gap-2">

      {/* Day headers */}
      {DAY_LABELS.map((label, i) => {
        const isToday = days[i] === today
        return (
          <div key={label} className="text-center pb-3">
            <p className={`text-[10px] font-bold uppercase tracking-widest
              ${isToday ? 'text-cornsilk-400' : 'text-ash-grey-700'}`}>{label}</p>
            <p className={`text-xl font-display font-bold mt-0.5
              ${isToday ? 'text-cornsilk-300' : 'text-ink-black-400'}`}>
              {new Date(days[i] + 'T00:00:00').getDate()}
            </p>
          </div>
        )
      })}

      {/* Day columns */}
      {days.map(day => {
        const daySessions = sessions.filter(s => s.scheduled_date === day)
        const isToday     = day === today
        return (
          <div key={day}
            className={`min-h-36 rounded-xl p-1.5 space-y-1.5 border
              ${isToday
                ? 'border-cornsilk-500/20 bg-cornsilk-500/[0.03]'
                : 'border-ink-black-700/40 bg-ink-black-900/50'}`}>
            {daySessions.length === 0 ? (
              <div className="h-full min-h-28 flex items-center justify-center">
                <span className="text-ink-black-800 text-xs">—</span>
              </div>
            ) : (
              daySessions.map(session => (
                <div key={session.id}
                  className={`rounded-lg border px-2 py-1.5 text-xs cursor-pointer hover:brightness-125 transition-all
                    ${TYPE_COLORS[session.session_type] ?? 'bg-ink-black-800 text-ink-black-300 border-ink-black-700'}`}>
                  {/* Priority dot + type */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[session.priority]}`} />
                    <span className="uppercase tracking-widest text-[9px] opacity-60 font-semibold">
                      {session.session_type.replace('_', ' ')}
                    </span>
                  </div>
                  {/* Title */}
                  <div className="font-semibold leading-tight line-clamp-2 text-[11px]">{session.title}</div>
                  {/* Duration */}
                  {session.duration_mins && (
                    <div className="opacity-50 mt-1 text-[10px]">{session.duration_mins} min</div>
                  )}
                  {/* Status — only shown when not default "scheduled" */}
                  {session.status !== 'scheduled' && (
                    <div className={`mt-1 text-[9px] font-bold uppercase tracking-wider
                      ${session.status === 'completed' ? 'text-tropical-teal-400' : 'text-ash-grey-600'}`}>
                      {session.status}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}
