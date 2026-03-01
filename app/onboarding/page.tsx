'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Static config ────────────────────────────────────────────────────────────

const CROSSFIT_LEVELS = [
  { value: 'beginner',     label: 'Beginner',     desc: 'Learning movements, building base fitness' },
  { value: 'intermediate', label: 'Intermediate',  desc: 'Consistent training, scaling some RX movements' },
  { value: 'advanced',     label: 'Advanced',      desc: 'Mostly RX, performance-focused' },
  { value: 'rx',           label: 'RX',            desc: 'Fully RX, competition-focused athlete' },
]
const LIFTING_LEVELS = [
  { value: 'beginner',     label: 'Beginner',     desc: 'Still learning the Olympic lifts' },
  { value: 'intermediate', label: 'Intermediate',  desc: 'Technically sound, building strength' },
  { value: 'advanced',     label: 'Advanced',      desc: 'Hitting significant percentages' },
  { value: 'competitive',  label: 'Competitive',   desc: 'Competing at club or national level' },
]
const RUNNING_LEVELS = [
  { value: 'beginner',   label: 'Beginner',   desc: 'Building base — sub-30 min 5K' },
  { value: 'intermediate', label: 'Intermediate', desc: 'Running regularly, sub-25 min 5K' },
  { value: 'advanced',   label: 'Advanced',   desc: 'Sub-20 min 5K, half marathon capable' },
  { value: 'sub-elite',  label: 'Sub-elite',  desc: 'Sub-17 min 5K, marathon racing' },
]

// 0=Sun, 1=Mon … 6=Sat — matches DB convention
const WEEK_DAYS = [
  { label: 'M', value: 1 }, { label: 'T', value: 2 }, { label: 'W', value: 3 },
  { label: 'T', value: 4 }, { label: 'F', value: 5 }, { label: 'S', value: 6 }, { label: 'S', value: 0 },
]
const DURATIONS = [45, 60, 75, 90, 120]

const GOALS = [
  { value: 'general_fitness',  label: 'General Fitness',  desc: 'Balanced training across all domains', icon: '⚡' },
  { value: 'hyrox_prep',       label: 'Hyrox Prep',       desc: 'Race-specific fitness for Hyrox events', icon: '🏅' },
  { value: 'strength_focus',   label: 'Strength Focus',   desc: 'Prioritise Olympic lifting numbers', icon: '🏋️' },
  { value: 'endurance_focus',  label: 'Endurance Focus',  desc: 'Aerobic base, running volume & engine', icon: '🏃' },
]

const BENCHMARK_LIFTS = [
  { name: 'clean_and_jerk', label: 'Clean & Jerk' },
  { name: 'snatch',         label: 'Snatch' },
  { name: 'back_squat',     label: 'Back Squat' },
  { name: 'deadlift',       label: 'Deadlift' },
]

const TOTAL_STEPS = 4

// ─── Option card ──────────────────────────────────────────────────────────────

function OptionCard({ label, desc, selected, onClick }: {
  label: string; desc?: string; selected: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-xl border transition-all
        ${selected
          ? 'bg-cerulean-500/15 border-cerulean-500/60 text-cerulean-200'
          : 'bg-ink-black-800/60 border-ink-black-700/50 text-ink-black-300 hover:border-ink-black-600 hover:text-ink-black-100'}`}>
      <span className="font-semibold text-sm block">{label}</span>
      {desc && <span className="text-xs opacity-60 leading-snug">{desc}</span>}
    </button>
  )
}

// ─── Level group ──────────────────────────────────────────────────────────────

function LevelGroup({ title, color, options, value, onChange }: {
  title: string; color: string; options: typeof CROSSFIT_LEVELS
  value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${color}`}>{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <OptionCard key={opt.value} label={opt.label} desc={opt.desc}
            selected={value === opt.value} onClick={() => onChange(opt.value)} />
        ))}
      </div>
    </div>
  )
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep]   = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [form, setForm] = useState({
    crossfit_level: '',
    lifting_level: '',
    running_level: '',
    typical_training_days: [] as number[],
    typical_session_duration_mins: 60,
    primary_goal: '',
  })

  const [benchmarks, setBenchmarks] = useState<Record<string, string>>({
    clean_and_jerk: '', snatch: '', back_squat: '', deadlift: '',
  })

  function toggleDay(day: number) {
    setForm(p => ({
      ...p,
      typical_training_days: p.typical_training_days.includes(day)
        ? p.typical_training_days.filter(d => d !== day)
        : [...p.typical_training_days, day],
    }))
  }

  // Validate before advancing
  const canAdvance = () => {
    if (step === 1) return !!(form.crossfit_level && form.lifting_level && form.running_level)
    if (step === 2) return form.typical_training_days.length > 0
    if (step === 3) return !!form.primary_goal
    return true
  }

  async function handleComplete() {
    setSaving(true); setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Save athlete profile
    const { error: profileErr } = await supabase.from('athlete_profiles').insert({
      user_id: user.id, ...form,
    })
    if (profileErr) { setError(profileErr.message); setSaving(false); return }

    // Save any filled-in benchmark lifts
    const liftRows = BENCHMARK_LIFTS
      .filter(l => benchmarks[l.name].trim() !== '')
      .map(l => ({
        user_id: user.id,
        lift_name: l.name,
        weight_kg: parseFloat(benchmarks[l.name]),
        recorded_at: new Date().toISOString().split('T')[0],
      }))

    if (liftRows.length > 0) {
      const { error: liftErr } = await supabase.from('benchmark_lifts').insert(liftRows)
      if (liftErr) { setError(liftErr.message); setSaving(false); return }
    }

    setSaving(false)
    router.push('/dashboard')
    router.refresh()
  }

  const pct = Math.round((step / TOTAL_STEPS) * 100)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-ink-black-900 border border-ink-black-700/50 rounded-2xl shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-ink-black-800">
          <div className="h-full bg-cerulean-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>

        <div className="px-8 py-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-ash-grey-600 mb-1">
            Step {step} of {TOTAL_STEPS}
          </p>

          {/* ── Step 1: Sport Levels ─────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <h2 className="font-display text-2xl font-bold text-ink-black-50 mb-1">Your sport levels</h2>
              <p className="text-ash-grey-500 text-sm mb-6">Helps the AI calibrate intensity for each discipline.</p>
              <div className="space-y-5">
                <LevelGroup title="CrossFit" color="text-cerulean-500"
                  options={CROSSFIT_LEVELS} value={form.crossfit_level}
                  onChange={v => setForm(p => ({ ...p, crossfit_level: v }))} />
                <LevelGroup title="Olympic Lifting" color="text-ink-black-400"
                  options={LIFTING_LEVELS} value={form.lifting_level}
                  onChange={v => setForm(p => ({ ...p, lifting_level: v }))} />
                <LevelGroup title="Running" color="text-tropical-teal-500"
                  options={RUNNING_LEVELS} value={form.running_level}
                  onChange={v => setForm(p => ({ ...p, running_level: v }))} />
              </div>
            </div>
          )}

          {/* ── Step 2: Schedule ─────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <h2 className="font-display text-2xl font-bold text-ink-black-50 mb-1">Your schedule</h2>
              <p className="text-ash-grey-500 text-sm mb-6">Which days are you typically available to train?</p>

              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-ash-grey-600 mb-3">Training days</p>
                <div className="flex gap-2">
                  {WEEK_DAYS.map(({ label, value }) => {
                    const sel = form.typical_training_days.includes(value)
                    return (
                      <button key={value} type="button" onClick={() => toggleDay(value)}
                        className={`w-10 h-10 rounded-xl text-sm font-bold font-display transition-all
                          ${sel ? 'bg-cerulean-500 text-ink-black-950'
                               : 'bg-ink-black-800 text-ash-grey-500 border border-ink-black-700/50 hover:border-ink-black-600'}`}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-ash-grey-600 mb-3">Typical session length</p>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map(mins => (
                    <button key={mins} type="button"
                      onClick={() => setForm(p => ({ ...p, typical_session_duration_mins: mins }))}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all
                        ${form.typical_session_duration_mins === mins
                          ? 'bg-cerulean-500 text-ink-black-950'
                          : 'bg-ink-black-800 text-ash-grey-400 border border-ink-black-700/50 hover:border-ink-black-600'}`}>
                      {mins < 60 ? `${mins} min` : mins === 60 ? '60 min' : mins === 120 ? '2 hrs' : `${mins} min`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Goal ─────────────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <h2 className="font-display text-2xl font-bold text-ink-black-50 mb-1">Your primary goal</h2>
              <p className="text-ash-grey-500 text-sm mb-6">The AI references this when building every training block.</p>
              <div className="grid grid-cols-2 gap-3">
                {GOALS.map(goal => {
                  const sel = form.primary_goal === goal.value
                  return (
                    <button key={goal.value} type="button"
                      onClick={() => setForm(p => ({ ...p, primary_goal: goal.value }))}
                      className={`text-left px-4 py-4 rounded-xl border transition-all
                        ${sel ? 'bg-cerulean-500/15 border-cerulean-500/60'
                              : 'bg-ink-black-800/60 border-ink-black-700/50 hover:border-ink-black-600'}`}>
                      <span className="text-2xl block mb-2">{goal.icon}</span>
                      <p className={`font-display font-bold text-sm mb-1 ${sel ? 'text-cerulean-200' : 'text-ink-black-100'}`}>
                        {goal.label}
                      </p>
                      <p className="text-xs text-ash-grey-500 leading-snug">{goal.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Benchmarks (optional) ────────────────────────────── */}
          {step === 4 && (
            <div>
              <h2 className="font-display text-2xl font-bold text-ink-black-50 mb-1">Key lifts</h2>
              <p className="text-ash-grey-500 text-sm mb-6">
                Optional — lets the AI prescribe accurate percentages. Skip if unknown.
              </p>
              <div className="space-y-4">
                {BENCHMARK_LIFTS.map(lift => (
                  <div key={lift.name}>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-ash-grey-500 mb-1.5">
                      {lift.label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" step="0.5" placeholder="—"
                        value={benchmarks[lift.name]}
                        onChange={e => setBenchmarks(p => ({ ...p, [lift.name]: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-lg bg-ink-black-800 border border-ink-black-700/60
                                   text-ink-black-100 placeholder-ash-grey-700 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-cerulean-500 transition
                                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      <span className="text-ash-grey-600 text-sm shrink-0">kg</span>
                    </div>
                  </div>
                ))}
              </div>
              {error && <p className="text-cornsilk-400 text-sm mt-4">{error}</p>}
            </div>
          )}

          {/* ── Navigation ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mt-8">
            {step > 1
              ? <button type="button" onClick={() => setStep(s => s - 1)}
                  className="text-sm text-ash-grey-500 hover:text-ink-black-200 transition-colors">← Back</button>
              : <div />
            }
            {step < TOTAL_STEPS
              ? <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}
                  className="px-6 py-2.5 rounded-xl bg-cerulean-500 hover:bg-cerulean-400
                             text-ink-black-950 font-semibold text-sm tracking-wide
                             transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  Continue →
                </button>
              : <div className="flex gap-3">
                  <button type="button" onClick={handleComplete} disabled={saving}
                    className="px-4 py-2.5 rounded-xl border border-ink-black-700/50 text-ash-grey-400
                               hover:text-ink-black-100 hover:border-ink-black-600 text-sm transition-colors disabled:opacity-30">
                    Skip
                  </button>
                  <button type="button" onClick={handleComplete} disabled={saving}
                    className="px-6 py-2.5 rounded-xl bg-cerulean-500 hover:bg-cerulean-400
                               text-ink-black-950 font-semibold text-sm tracking-wide
                               transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    {saving ? 'Saving…' : 'Complete setup'}
                  </button>
                </div>
            }
          </div>
        </div>
      </div>
      <p className="mt-6 font-display text-sm text-ink-black-800 tracking-wide">
        Hybrid<span className="text-cerulean-900"> Athlete</span>
      </p>
    </div>
  )
}
