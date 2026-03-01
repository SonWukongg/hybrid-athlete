'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AthleteProfile, BenchmarkLift, Profile } from '@/lib/types'
import type { SuggestedScheme } from '@/app/api/suggest-schemes/route'

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { id: 'build_strength',       label: 'Build Strength',        description: 'Prioritise barbell progression — squat, deadlift, press' },
  { id: 'olympic_lifting',      label: 'Olympic Lifting',       description: 'Develop clean & jerk and/or snatch technique and numbers' },
  { id: 'crossfit_performance', label: 'CrossFit Performance',  description: 'Peak for competition or improve benchmark WOD scores' },
  { id: 'improve_running',      label: 'Improve Running',       description: 'Build aerobic base, target a faster 5K or 10K time' },
  { id: 'strength_and_running', label: 'Strength + Running',    description: 'Get stronger without sacrificing running capacity' },
  { id: 'balanced_hybrid',      label: 'Balanced Hybrid',       description: 'Maintain performance across lifting, CrossFit, and running equally' },
]

const MOVEMENT_GROUPS = [
  {
    pattern: 'Squat',
    movements: [
      { id: 'back_squat',  label: 'Back Squat',  isRunning: false },
      { id: 'front_squat', label: 'Front Squat', isRunning: false },
    ],
  },
  {
    pattern: 'Hinge',
    movements: [
      { id: 'deadlift',           label: 'Deadlift',           isRunning: false },
      { id: 'romanian_deadlift',  label: 'Romanian Deadlift',  isRunning: false },
    ],
  },
  {
    pattern: 'Olympic',
    movements: [
      { id: 'clean_and_jerk', label: 'Clean & Jerk', isRunning: false },
      { id: 'snatch',         label: 'Snatch',        isRunning: false },
    ],
  },
  {
    pattern: 'Press',
    movements: [
      { id: 'strict_press', label: 'Strict Press', isRunning: false },
      { id: 'push_press',   label: 'Push Press',   isRunning: false },
      { id: 'bench_press',  label: 'Bench Press',  isRunning: false },
    ],
  },
  {
    pattern: 'Running',
    movements: [
      { id: '5k_time',   label: '5K Time',           isRunning: true },
      { id: '10k_time',  label: '10K Time',           isRunning: true },
      { id: '400m_pace', label: '400m Repeat Pace',   isRunning: true },
    ],
  },
]

const ALL_MOVEMENTS = MOVEMENT_GROUPS.flatMap(g =>
  g.movements.map(m => ({ ...m, pattern: g.pattern }))
)

const MAX_MOVEMENTS = 4

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | 'idle'
  | 'loading-context'
  | 'select-goals'
  | 'select-movements'
  | 'loading-schemes'
  | 'confirm-schemes'
  | 'confirm-numbers'
  | 'generating'

interface AthleteContext {
  profile: Profile | null
  athleteProfile: AthleteProfile | null
  benchmarkLifts: BenchmarkLift[]
}

// Find a saved 1RM by movement_id — matches lift_name in DB (both snake_case)
function findBenchmark(lifts: BenchmarkLift[], movement_id: string): number | null {
  return lifts.find(l => l.lift_name === movement_id)?.weight_kg ?? null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <p className="font-display text-xl font-semibold text-ink-black-300 mb-1">{title}</p>
      <p className="text-ash-grey-600 text-sm">{subtitle}</p>
    </div>
  )
}

function ContinueButton({ onClick, disabled, label = 'Continue' }: {
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full px-6 py-3 rounded-xl bg-cerulean-500 hover:bg-cerulean-400
                 text-ink-black-950 font-semibold text-sm tracking-wide transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}

function Dots() {
  return (
    <div className="flex gap-1.5 justify-center">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-1.5 h-1.5 rounded-full bg-cerulean-500 animate-pulse"
          style={{ animationDelay: `${i * 0.3}s` }} />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GeneratePlanButton({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep]                   = useState<Step>('idle')
  const [context, setContext]             = useState<AthleteContext | null>(null)
  const [selectedGoals, setSelectedGoals] = useState<string[]>([])
  const [selectedMovements, setSelectedMovements] = useState<string[]>([])
  const [suggestedSchemes, setSuggestedSchemes]   = useState<SuggestedScheme[]>([])
  // weight inputs keyed by movement id; running movements store mm:ss strings
  const [movementWeights, setMovementWeights]     = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  // ── Step 1: fetch context ─────────────────────────────────────────────────
  async function handleStart() {
    setStep('loading-context')
    setError(null)

    const [profileRes, athleteRes, liftsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('athlete_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('benchmark_lifts').select('*').eq('user_id', userId).order('recorded_at', { ascending: false }),
    ])

    if (profileRes.error)  console.warn('[context] profiles error:',        profileRes.error.message)
    if (athleteRes.error)  console.warn('[context] athlete_profiles error:', athleteRes.error.message)
    if (liftsRes.error)    console.warn('[context] benchmark_lifts error:',  liftsRes.error.message)

    const assembled: AthleteContext = {
      profile:        profileRes.data ?? null,
      athleteProfile: athleteRes.data ?? null,
      benchmarkLifts: liftsRes.data ?? [],
    }

    console.group('%c[Hybrid Athlete] Assembled athlete context', 'color: #4EB5F7; font-weight: bold')
    console.log('Profile:',          assembled.profile)
    console.log('Athlete profile:',  assembled.athleteProfile)
    console.log('Benchmark lifts:',  assembled.benchmarkLifts)
    console.groupEnd()

    setContext(assembled)
    setStep('select-goals')
  }

  // ── Step 2: goal toggle ───────────────────────────────────────────────────
  function toggleGoal(id: string) {
    setSelectedGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }

  function handleGoalsContinue() {
    console.group('%c[Hybrid Athlete] Goals selected', 'color: #4EB5F7; font-weight: bold')
    console.log('Selected goals:', selectedGoals)
    console.groupEnd()
    setStep('select-movements')
  }

  // ── Step 3: movement toggle ───────────────────────────────────────────────
  function toggleMovement(id: string) {
    setSelectedMovements(prev => {
      if (prev.includes(id)) return prev.filter(m => m !== id)
      if (prev.length >= MAX_MOVEMENTS) return prev   // enforce cap
      return [...prev, id]
    })
  }

  async function handleMovementsContinue() {
    console.group('%c[Hybrid Athlete] Movements selected', 'color: #4EB5F7; font-weight: bold')
    console.log('Selected movements:', selectedMovements)
    console.groupEnd()

    setStep('loading-schemes')
    setError(null)

    const movementObjects = selectedMovements.map(id => {
      const m = ALL_MOVEMENTS.find(m => m.id === id)!
      return { id: m.id, label: m.label, pattern: m.pattern }
    })

    const res = await fetch('/api/suggest-schemes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        movements: movementObjects,
        goals: selectedGoals,
        crossfit_level: context?.athleteProfile?.crossfit_level ?? null,
        lifting_level:  context?.athleteProfile?.lifting_level  ?? null,
        running_level:  context?.athleteProfile?.running_level  ?? null,
      }),
    })

    const data = await res.json()

    if (!res.ok || !data?.schemes) {
      setError(data?.error ?? 'Failed to get scheme suggestions.')
      setStep('select-movements')
      return
    }

    console.group('%c[Hybrid Athlete] AI scheme suggestions', 'color: #4EB5F7; font-weight: bold')
    console.log('Schemes:', data.schemes)
    console.groupEnd()

    setSuggestedSchemes(data.schemes)
    setStep('confirm-schemes')
  }

  // ── Step 4: confirm schemes → pre-fill numbers ────────────────────────────
  function handleSchemesContinue() {
    console.group('%c[Hybrid Athlete] Schemes confirmed', 'color: #4EB5F7; font-weight: bold')
    console.log('Confirmed schemes:', suggestedSchemes)
    console.groupEnd()

    // Pre-fill weights from benchmark_lifts
    const prefilled: Record<string, string> = {}
    for (const scheme of suggestedSchemes) {
      const m = ALL_MOVEMENTS.find(m => m.id === scheme.movement_id)
      if (!m) continue
      if (m.isRunning) {
        prefilled[scheme.movement_id] = ''   // user fills time manually
      } else {
        const saved = findBenchmark(context?.benchmarkLifts ?? [], m.id)
        prefilled[scheme.movement_id] = saved ? String(saved) : ''
      }
    }

    setMovementWeights(prefilled)
    setStep('confirm-numbers')
  }

  // ── Step 5: generate ──────────────────────────────────────────────────────
  async function handleGenerate() {
    const payload = {
      user_id:        userId,
      selected_goals: selectedGoals,
      selected_movements: suggestedSchemes.map(s => {
        const m = ALL_MOVEMENTS.find(m => m.id === s.movement_id)!
        return {
          movement_id:      s.movement_id,
          movement_label:   s.movement_label,
          pattern:          m.pattern,
          is_running:       m.isRunning,
          scheme_name:      s.scheme_name,
          sets:             s.sets,
          reps:             s.reps,
          progression_type: s.progression_type,
          current_value:    movementWeights[s.movement_id] ?? null,  // kg or mm:ss
        }
      }),
    }

    console.group('%c[Hybrid Athlete] Generating block — full payload', 'color: #4EB5F7; font-weight: bold')
    console.log(payload)
    console.groupEnd()

    setStep('generating')
    setError(null)

    const res = await fetch('/api/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()

    if (!res.ok || !data?.success) {
      setError(data?.error ?? 'Generation failed. Please try again.')
      setStep('confirm-numbers')
      return
    }

    router.refresh()
  }

  // ─── Render: loading context ──────────────────────────────────────────────
  if (step === 'loading-context') {
    return (
      <div className="mt-16 flex flex-col items-center gap-3">
        <Dots />
        <p className="text-ash-grey-500 text-sm">Loading your profile...</p>
      </div>
    )
  }

  // ─── Render: select goals ─────────────────────────────────────────────────
  if (step === 'select-goals') {
    return (
      <div className="mt-10 max-w-lg mx-auto">
        <StepHeader
          title="What are your goals for this block?"
          subtitle="Select all that apply — the AI will prioritise accordingly."
        />

        <div className="flex flex-col gap-3 mb-8">
          {GOAL_OPTIONS.map(goal => {
            const selected = selectedGoals.includes(goal.id)
            return (
              <button key={goal.id} onClick={() => toggleGoal(goal.id)}
                className={[
                  'w-full text-left px-4 py-3.5 rounded-xl border transition-colors',
                  selected
                    ? 'border-cerulean-500 bg-cerulean-500/10 text-ink-black-100'
                    : 'border-ink-black-700 bg-ink-black-900 text-ink-black-300 hover:border-ink-black-500',
                ].join(' ')}>
                <span className="flex items-start gap-3">
                  <Checkbox checked={selected} />
                  <span>
                    <span className="block font-medium text-sm">{goal.label}</span>
                    <span className="block text-xs text-ash-grey-600 mt-0.5">{goal.description}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <ContinueButton onClick={handleGoalsContinue} disabled={selectedGoals.length === 0} />
      </div>
    )
  }

  // ─── Render: select movements ─────────────────────────────────────────────
  if (step === 'select-movements') {
    const count = selectedMovements.length
    const atMax = count >= MAX_MOVEMENTS

    return (
      <div className="mt-10 max-w-lg mx-auto">
        <StepHeader
          title="Which movements do you want to progress?"
          subtitle={`Pick 2–${MAX_MOVEMENTS} key lifts or benchmarks. These get a structured progression spine.`}
        />

        <div className="flex flex-col gap-6 mb-8">
          {MOVEMENT_GROUPS.map(group => (
            <div key={group.pattern}>
              <p className="text-xs font-semibold text-ash-grey-600 uppercase tracking-wider mb-2">
                {group.pattern}
              </p>
              <div className="flex flex-col gap-2">
                {group.movements.map(m => {
                  const selected = selectedMovements.includes(m.id)
                  const disabled = atMax && !selected
                  const savedKg  = !m.isRunning
                    ? findBenchmark(context?.benchmarkLifts ?? [], m.id)
                    : null

                  return (
                    <button key={m.id}
                      onClick={() => toggleMovement(m.id)}
                      disabled={disabled}
                      className={[
                        'w-full text-left px-4 py-3 rounded-xl border transition-colors',
                        selected
                          ? 'border-cerulean-500 bg-cerulean-500/10 text-ink-black-100'
                          : disabled
                            ? 'border-ink-black-800 bg-ink-black-950 text-ink-black-600 cursor-not-allowed'
                            : 'border-ink-black-700 bg-ink-black-900 text-ink-black-300 hover:border-ink-black-500',
                      ].join(' ')}>
                      <span className="flex items-center gap-3">
                        <Checkbox checked={selected} disabled={disabled} />
                        <span className="flex-1 font-medium text-sm">{m.label}</span>
                        {savedKg && (
                          <span className="text-xs text-ash-grey-600 shrink-0">
                            {savedKg} kg saved
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-ash-grey-600 mb-4 text-center">
          {count}/{MAX_MOVEMENTS} selected
          {atMax && ' — maximum reached'}
        </p>

        {error && <p className="text-cornsilk-400 text-sm mb-4">{error}</p>}

        <ContinueButton
          onClick={handleMovementsContinue}
          disabled={count < 2}
          label="Get AI scheme suggestions"
        />
      </div>
    )
  }

  // ─── Render: loading schemes ──────────────────────────────────────────────
  if (step === 'loading-schemes') {
    return (
      <div className="mt-16 flex flex-col items-center gap-3">
        <Dots />
        <p className="text-ash-grey-500 text-sm">Generating rep schemes for your movements...</p>
      </div>
    )
  }

  // ─── Render: confirm schemes ──────────────────────────────────────────────
  if (step === 'confirm-schemes') {
    return (
      <div className="mt-10 max-w-lg mx-auto">
        <StepHeader
          title="Here's what the AI suggests"
          subtitle="Rep schemes are tailored to your goals and experience level."
        />

        <div className="flex flex-col gap-4 mb-8">
          {suggestedSchemes.map(scheme => (
            <div key={scheme.movement_id}
              className="rounded-xl border border-ink-black-700 bg-ink-black-900 px-4 py-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <span className="font-medium text-sm text-ink-black-100">{scheme.movement_label}</span>
                <span className="text-xs font-semibold text-cerulean-400 shrink-0 mt-0.5">
                  {scheme.scheme_name}
                </span>
              </div>
              <p className="text-xs text-ash-grey-500 mb-3">
                {scheme.sets} sets × {scheme.reps} reps
              </p>
              <p className="text-xs text-ash-grey-600 leading-relaxed">{scheme.rationale}</p>
            </div>
          ))}
        </div>

        <ContinueButton onClick={handleSchemesContinue} label="Looks good — confirm" />
      </div>
    )
  }

  // ─── Render: confirm numbers ──────────────────────────────────────────────
  if (step === 'confirm-numbers') {
    const allFilled = suggestedSchemes.every(s => {
      const val = movementWeights[s.movement_id] ?? ''
      return val.trim() !== ''
    })

    return (
      <div className="mt-10 max-w-lg mx-auto">
        <StepHeader
          title="What are your current numbers?"
          subtitle="We'll use these to calculate exact weights for your progression spine."
        />

        <div className="flex flex-col gap-4 mb-8">
          {suggestedSchemes.map(scheme => {
            const m = ALL_MOVEMENTS.find(m => m.id === scheme.movement_id)!
            const val = movementWeights[scheme.movement_id] ?? ''

            return (
              <div key={scheme.movement_id}
                className="rounded-xl border border-ink-black-700 bg-ink-black-900 px-4 py-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm text-ink-black-100">{scheme.movement_label}</span>
                  <span className="text-xs text-ash-grey-600">{scheme.scheme_name}</span>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <input
                    type={m.isRunning ? 'text' : 'number'}
                    inputMode={m.isRunning ? 'text' : 'decimal'}
                    placeholder={m.isRunning ? 'e.g. 22:30' : '0'}
                    value={val}
                    onChange={e => setMovementWeights(prev => ({
                      ...prev,
                      [scheme.movement_id]: e.target.value,
                    }))}
                    className="flex-1 bg-ink-black-950 border border-ink-black-700 rounded-lg
                               px-3 py-2 text-sm text-ink-black-100 placeholder-ash-grey-700
                               focus:outline-none focus:border-cerulean-500 transition-colors"
                  />
                  <span className="text-xs text-ash-grey-600 w-12 shrink-0">
                    {m.isRunning ? 'mm:ss' : 'kg (1RM)'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {error && <p className="text-cornsilk-400 text-sm mb-4">{error}</p>}

        <ContinueButton
          onClick={handleGenerate}
          disabled={!allFilled}
          label="Build my training block"
        />
      </div>
    )
  }

  // ─── Render: generating ───────────────────────────────────────────────────
  if (step === 'generating') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-black-950 flex flex-col items-center justify-center">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 rounded-full border-2 border-cerulean-500/30 animate-ping" />
          <div className="absolute inset-2 rounded-full border-2 border-cerulean-500/50 animate-pulse" />
          <div className="absolute inset-4 rounded-full bg-cerulean-500/10 border border-cerulean-500/60
                          flex items-center justify-center">
            <span className="text-2xl">🏋️</span>
          </div>
        </div>
        <h2 className="font-display text-2xl font-bold text-ink-black-50 mb-2">
          Building your training block...
        </h2>
        <p className="text-ash-grey-500 text-sm max-w-xs text-center">
          The AI is building your progression spine and structuring your weeks.
        </p>
        <div className="mt-6"><Dots /></div>
      </div>
    )
  }

  // ─── Render: idle ─────────────────────────────────────────────────────────
  return (
    <div className="mt-16 text-center">
      <div className="w-14 h-14 rounded-full bg-cornsilk-500/10 border border-cornsilk-500/20
                      flex items-center justify-center mx-auto mb-4 text-2xl">🏋️</div>
      <p className="font-display text-xl font-semibold text-ink-black-300">No training block yet</p>
      <p className="text-ash-grey-600 text-sm mt-2 max-w-xs mx-auto mb-6">
        Your profile is set up. Generate your first AI training block to get started.
      </p>

      {error && <p className="text-cornsilk-400 text-sm mb-4 max-w-sm mx-auto">{error}</p>}

      <button onClick={handleStart}
        className="px-6 py-3 rounded-xl bg-cerulean-500 hover:bg-cerulean-400
                   text-ink-black-950 font-semibold text-sm tracking-wide transition-colors">
        Generate My Plan
      </button>
    </div>
  )
}

// ─── Checkbox helper ──────────────────────────────────────────────────────────

function Checkbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span className={[
      'mt-0.5 w-4 h-4 rounded shrink-0 border flex items-center justify-center transition-colors',
      checked   ? 'bg-cerulean-500 border-cerulean-500'
      : disabled ? 'border-ink-black-700'
      :            'border-ink-black-600',
    ].join(' ')}>
      {checked && (
        <svg className="w-2.5 h-2.5 text-ink-black-950" fill="none" viewBox="0 0 10 10">
          <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}
