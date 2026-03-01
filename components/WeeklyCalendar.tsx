'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Session, Exercise } from '@/lib/types'

// ─── Colour maps ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  crossfit:        'bg-cerulean-500/15 text-cerulean-300 border-cerulean-500/25',
  olympic_lifting: 'bg-ink-black-700/50 text-ink-black-300 border-ink-black-600/40',
  run:             'bg-tropical-teal-500/15 text-tropical-teal-300 border-tropical-teal-500/25',
  strength:        'bg-ash-grey-700/30 text-ash-grey-300 border-ash-grey-600/30',
  rest:            'bg-ink-black-800/60 text-ash-grey-600 border-ink-black-700/30',
  active_recovery: 'bg-tropical-teal-800/40 text-tropical-teal-400 border-tropical-teal-700/30',
}

const TYPE_LABEL_COLORS: Record<string, string> = {
  crossfit:        'text-cerulean-400 bg-cerulean-500/10 border-cerulean-500/20',
  olympic_lifting: 'text-ash-grey-400 bg-ink-black-700/40 border-ink-black-600/30',
  run:             'text-tropical-teal-400 bg-tropical-teal-500/10 border-tropical-teal-500/20',
  strength:        'text-ash-grey-300 bg-ash-grey-700/20 border-ash-grey-600/20',
  rest:            'text-ash-grey-500 bg-ink-black-800/40 border-ink-black-700/20',
  active_recovery: 'text-tropical-teal-400 bg-tropical-teal-800/30 border-tropical-teal-700/20',
}

const PRIORITY_DOT: Record<string, string> = {
  key:      'bg-cornsilk-400',
  standard: 'bg-ink-black-600',
  optional: 'bg-ink-black-700',
}

const PRIORITY_LABEL: Record<string, string> = {
  key:      'text-cornsilk-400',
  standard: 'text-ash-grey-500',
  optional: 'text-ink-black-600',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  sessions:           Session[]
  blockStart:         string | null
  blockDurationWeeks: number | null
}

// ─── Week helpers ─────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  return d
}

function addWeeks(monday: Date, weeks: number): Date {
  const d = new Date(monday)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

function buildWeekDays(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toISO(d)
  })
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const from = monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const to   = sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${from} — ${to}`
}

// ─── Exercise formatting helpers ──────────────────────────────────────────────

function formatExerciseDetail(e: Exercise): string {
  const parts: string[] = []

  if (e.sets && (e.reps || e.reps_note)) {
    parts.push(`${e.sets} × ${e.reps_note ?? e.reps}`)
  } else if (e.sets) {
    parts.push(`${e.sets} sets`)
  }

  if (e.weight_pct_1rm) parts.push(`@ ${e.weight_pct_1rm}% 1RM`)

  if (e.distance_m) {
    parts.push(e.distance_m >= 1000 ? `${e.distance_m / 1000} km` : `${e.distance_m} m`)
  }

  if (e.duration_secs) {
    const mins = Math.floor(e.duration_secs / 60)
    const secs = e.duration_secs % 60
    parts.push(secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins} min`)
  }

  if (e.pace_per_km) {
    // Supabase returns interval as HH:MM:SS — convert to M:SS for display
    const paceStr = String(e.pace_per_km)
    const paceDisplay = paceStr.startsWith('00:')
      ? paceStr.slice(3).replace(/^0/, '')   // "00:05:30" → "5:30"
      : paceStr
    parts.push(`@ ${paceDisplay} /km`)
  }

  if (e.rest_secs) {
    const mins = Math.floor(e.rest_secs / 60)
    const secs = e.rest_secs % 60
    parts.push(`rest ${secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins} min`}`)
  }

  return parts.join('  ·  ')
}

function exerciseTypeIcon(type: Exercise['exercise_type']): string {
  const icons: Record<string, string> = {
    lift:         '🏋️',
    run:          '🏃',
    row:          '🚣',
    ski:          '⛷️',
    bike:         '🚴',
    gymnastics:   '🤸',
    conditioning: '⚡',
    accessory:    '💪',
  }
  return icons[type] ?? '•'
}

// ─── Session Modal ────────────────────────────────────────────────────────────

function SessionModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const supabase = createClient()
  const [exercises, setExercises] = useState<Exercise[] | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    supabase
      .from('exercises')
      .select('*')
      .eq('session_id', session.id)
      .order('order_index', { ascending: true })
      .then(({ data }) => {
        setExercises((data as Exercise[]) ?? [])
        setLoading(false)
      })
  }, [session.id])

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const typeColor   = TYPE_LABEL_COLORS[session.session_type] ?? 'text-ash-grey-400 bg-ink-black-700/40 border-ink-black-600/30'
  const sessionDate = new Date(session.scheduled_date + 'T00:00:00')
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-black-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={handleBackdrop}
    >
      <div className="w-full max-w-lg bg-ink-black-900 border border-ink-black-700 rounded-2xl
                      shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-ink-black-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5
                                  rounded-full border ${typeColor}`}>
                  {session.session_type.replace('_', ' ')}
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_LABEL[session.priority]}`}>
                  {session.priority}
                </span>
              </div>
              <h2 className="font-display text-lg font-bold text-ink-black-50 leading-tight">
                {session.title}
              </h2>
              <p className="text-ash-grey-600 text-xs mt-1">{sessionDate}</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 rounded-full bg-ink-black-800 hover:bg-ink-black-700
                         flex items-center justify-center text-ash-grey-500 hover:text-ink-black-100
                         transition-colors mt-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 14 14">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-3 text-xs text-ash-grey-600">
            {session.duration_mins && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 3v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {session.duration_mins} min
              </span>
            )}
            {session.status !== 'scheduled' && (
              <span className={`font-bold uppercase tracking-wider
                ${session.status === 'completed' ? 'text-tropical-teal-400' : 'text-ash-grey-600'}`}>
                {session.status}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* AI Rationale */}
          {session.ai_rationale && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ash-grey-700 mb-1.5">
                Why this session
              </p>
              <p className="text-ash-grey-500 text-xs leading-relaxed">{session.ai_rationale}</p>
            </div>
          )}

          {/* Exercises */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ash-grey-700 mb-2">
              Exercises
            </p>

            {loading ? (
              <div className="flex items-center gap-2 text-ash-grey-700 text-xs py-4">
                <div className="w-1 h-1 rounded-full bg-ash-grey-700 animate-pulse" />
                <div className="w-1 h-1 rounded-full bg-ash-grey-700 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-1 h-1 rounded-full bg-ash-grey-700 animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            ) : exercises && exercises.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {exercises.map(ex => (
                  <div key={ex.id}
                    className="rounded-xl bg-ink-black-950/60 border border-ink-black-800 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0 mt-0.5">{exerciseTypeIcon(ex.exercise_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink-black-100 text-sm font-medium leading-tight">{ex.name}</p>
                        {formatExerciseDetail(ex) && (
                          <p className="text-ash-grey-600 text-xs mt-0.5">{formatExerciseDetail(ex)}</p>
                        )}
                        {ex.notes && (
                          <p className="text-ash-grey-700 text-[11px] mt-1 leading-snug italic">{ex.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ash-grey-700 text-xs py-2">
                No exercises recorded for this session yet.
              </p>
            )}
          </div>

          {/* Completion notes */}
          {session.completion_notes && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ash-grey-700 mb-1.5">
                Notes
              </p>
              <p className="text-ash-grey-500 text-xs leading-relaxed">{session.completion_notes}</p>
            </div>
          )}

          {/* RPE */}
          {session.perceived_exertion && (
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ash-grey-700">RPE</p>
              <div className="flex items-center gap-1">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i}
                    className={`w-2.5 h-2.5 rounded-sm ${
                      i < session.perceived_exertion!
                        ? i < 5 ? 'bg-tropical-teal-500' : i < 8 ? 'bg-cornsilk-400' : 'bg-red-500'
                        : 'bg-ink-black-800'
                    }`} />
                ))}
                <span className="text-xs text-ash-grey-500 ml-1">{session.perceived_exertion}/10</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function WeeklyCalendar({ sessions, blockStart, blockDurationWeeks }: Props) {
  const todayMonday = getMondayOf(new Date())

  const [weekOffset, setWeekOffset]       = useState(0)
  const [selectedSession, setSelected]    = useState<Session | null>(null)

  const currentMonday = addWeeks(todayMonday, weekOffset)
  const days          = buildWeekDays(currentMonday)
  const today         = toISO(new Date())

  const blockFirstMonday = blockStart ? getMondayOf(new Date(blockStart + 'T00:00:00')) : null
  const blockLastMonday  = blockFirstMonday && blockDurationWeeks
    ? addWeeks(blockFirstMonday, blockDurationWeeks - 1)
    : null

  const canGoPrev = blockFirstMonday ? currentMonday > blockFirstMonday : weekOffset > -52
  const canGoNext = blockLastMonday  ? currentMonday < blockLastMonday  : weekOffset < 52

  const prev = useCallback(() => { if (canGoPrev) setWeekOffset(o => o - 1) }, [canGoPrev])
  const next = useCallback(() => { if (canGoNext) setWeekOffset(o => o + 1) }, [canGoNext])

  return (
    <>
      {/* ── Week navigation ── */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={prev} disabled={!canGoPrev}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     text-ash-grey-500 hover:text-ink-black-200 hover:bg-ink-black-800
                     disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Prev
        </button>

        <div className="text-center">
          <p className="text-ink-black-200 text-sm font-semibold">{formatWeekRange(currentMonday)}</p>
          {weekOffset === 0 && (
            <p className="text-cornsilk-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              This week
            </p>
          )}
        </div>

        <button onClick={next} disabled={!canGoNext}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     text-ash-grey-500 hover:text-ink-black-200 hover:bg-ink-black-800
                     disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
          Next
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── 7-column grid ── */}
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
          const isPast      = day < today

          return (
            <div key={day}
              className={[
                'min-h-36 rounded-xl p-1.5 space-y-1.5 border transition-colors',
                isToday
                  ? 'border-cornsilk-500/20 bg-cornsilk-500/[0.03]'
                  : isPast
                    ? 'border-ink-black-800/40 bg-ink-black-950/30'
                    : 'border-ink-black-700/40 bg-ink-black-900/50',
              ].join(' ')}>

              {daySessions.length === 0 ? (
                <div className="h-full min-h-28 flex items-center justify-center">
                  <span className="text-ink-black-800 text-xs">—</span>
                </div>
              ) : (
                daySessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => setSelected(session)}
                    className={[
                      'w-full text-left rounded-lg border px-2 py-1.5 text-xs',
                      'hover:brightness-125 active:scale-[0.98] transition-all',
                      isPast ? 'opacity-50' : '',
                      TYPE_COLORS[session.session_type] ?? 'bg-ink-black-800 text-ink-black-300 border-ink-black-700',
                    ].join(' ')}>

                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[session.priority]}`} />
                      <span className="uppercase tracking-widest text-[9px] opacity-60 font-semibold">
                        {session.session_type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="font-semibold leading-tight line-clamp-2 text-[11px]">{session.title}</div>
                    {session.duration_mins && (
                      <div className="opacity-50 mt-1 text-[10px]">{session.duration_mins} min</div>
                    )}
                    {session.status !== 'scheduled' && (
                      <div className={`mt-1 text-[9px] font-bold uppercase tracking-wider
                        ${session.status === 'completed' ? 'text-tropical-teal-400' : 'text-ash-grey-600'}`}>
                        {session.status}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )
        })}
      </div>

      {/* ── Session modal ── */}
      {selectedSession && (
        <SessionModal
          session={selectedSession}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
