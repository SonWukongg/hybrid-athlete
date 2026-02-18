'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, AthleteProfile, BenchmarkLift } from '@/lib/types'

// ─── Static option lists ──────────────────────────────────────────────────────
const CROSSFIT_OPTIONS  = ['beginner', 'intermediate', 'advanced', 'rx']
const LIFTING_OPTIONS   = ['beginner', 'intermediate', 'advanced', 'competitive']
const RUNNING_OPTIONS   = ['beginner', 'intermediate', 'advanced', 'sub-elite']
const GOAL_OPTIONS      = ['general_fitness', 'hyrox_prep', 'strength_focus', 'endurance_focus']
const DURATION_OPTIONS  = [45, 60, 75, 90, 120]
const LIFT_NAMES        = ['clean_and_jerk', 'snatch', 'back_squat', 'deadlift', 'clean', 'jerk', 'front_squat', 'overhead_squat']
const WEEK_DAYS         = [{ l: 'M', v: 1 },{ l: 'T', v: 2 },{ l: 'W', v: 3 },{ l: 'T', v: 4 },{ l: 'F', v: 5 },{ l: 'S', v: 6 },{ l: 'S', v: 0 }]

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Format snake_case → Title Case for display
const fmt = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'

// Map day number to abbreviation
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ─── Reusable UI pieces ───────────────────────────────────────────────────────

function SectionCard({ title, children, onEdit, editing, onSave, onCancel, saving }: {
  title: string; children: React.ReactNode
  editing: boolean; saving: boolean
  onEdit: () => void; onSave: () => void; onCancel: () => void
}) {
  return (
    <div className="bg-ink-black-900 border border-ink-black-700/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-ink-black-400">{title}</h2>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded-lg border border-ink-black-700/50 text-ash-grey-500
                         hover:text-ink-black-200 transition-colors">Cancel</button>
            <button onClick={onSave} disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-cerulean-500 hover:bg-cerulean-400
                         text-ink-black-950 font-semibold transition-colors disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button onClick={onEdit}
            className="text-xs text-cerulean-400 hover:text-cerulean-300 font-medium transition-colors">
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-ink-black-800/50 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-widest text-ash-grey-700 w-36 shrink-0">{label}</span>
      <span className="text-sm text-ink-black-200 text-right">{value}</span>
    </div>
  )
}

function TextInput({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-ash-grey-600 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg bg-ink-black-800 border border-ink-black-700/60
                   text-ink-black-100 placeholder-ash-grey-700 text-sm
                   focus:outline-none focus:ring-2 focus:ring-cerulean-500 transition" />
    </div>
  )
}

function PillSelect({ label, options, value, onChange, fmt: fmtFn = fmt }: {
  label: string; options: (string | number)[]
  value?: string | number | null; onChange: (v: string) => void
  fmt?: (v: string) => string
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-ash-grey-600 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => onChange(String(opt))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${String(opt) === String(value)
                ? 'bg-cerulean-500 text-ink-black-950'
                : 'bg-ink-black-800 text-ash-grey-400 border border-ink-black-700/50 hover:border-ink-black-600'}`}>
            {typeof opt === 'number' ? `${opt} min` : fmtFn(String(opt))}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), [])

  const [profile,        setProfile]        = useState<Profile | null>(null)
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(null)
  const [lifts,          setLifts]          = useState<BenchmarkLift[]>([])
  const [loading,        setLoading]        = useState(true)

  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [saveError,      setSaveError]      = useState<string | null>(null)

  // Draft copies — mutated during edit, discarded on cancel
  const [draftP, setDraftP] = useState<Partial<Profile>>({})
  const [draftA, setDraftA] = useState<Partial<AthleteProfile>>({})

  // New benchmark lift form
  const [addingLift, setAddingLift] = useState(false)
  const [newLift,    setNewLift]    = useState({ lift_name: 'clean_and_jerk', weight_kg: '', notes: '' })

  // ── Load all data ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: p }, { data: ap }, { data: bl }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('athlete_profiles').select('*').eq('user_id', user.id).single(),
      supabase.from('benchmark_lifts').select('*').eq('user_id', user.id).order('lift_name'),
    ])
    if (p)  setProfile(p as Profile)
    if (ap) setAthleteProfile(ap as AthleteProfile)
    if (bl) setLifts(bl as BenchmarkLift[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Edit helpers ───────────────────────────────────────────────────────────
  function startEdit(section: string) {
    setSaveError(null)
    setEditingSection(section)
    if (section === 'personal') setDraftP({ full_name: profile?.full_name, timezone: profile?.timezone })
    if (section === 'levels')   setDraftA({ crossfit_level: athleteProfile?.crossfit_level ?? null, lifting_level: athleteProfile?.lifting_level ?? null, running_level: athleteProfile?.running_level ?? null })
    if (section === 'schedule') setDraftA({ typical_training_days: [...(athleteProfile?.typical_training_days ?? [])], typical_session_duration_mins: athleteProfile?.typical_session_duration_mins })
    if (section === 'goal')     setDraftA({ primary_goal: athleteProfile?.primary_goal ?? '' })
    if (section === 'notes')    setDraftA({ notes: athleteProfile?.notes ?? '' })
  }

  function cancelEdit() { setEditingSection(null); setDraftP({}); setDraftA({}); setSaveError(null) }

  function toggleDraftDay(day: number) {
    const current = draftA.typical_training_days ?? []
    setDraftA(p => ({
      ...p,
      typical_training_days: current.includes(day) ? current.filter(d => d !== day) : [...current, day],
    }))
  }

  // ── Save per section ───────────────────────────────────────────────────────
  async function savePersonal() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update(draftP).eq('id', user!.id)
    if (error) { setSaveError(error.message); setSaving(false); return }
    setProfile(p => ({ ...p!, ...draftP }))
    setEditingSection(null); setSaving(false)
  }

  async function saveAthlete() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('athlete_profiles').update(draftA).eq('user_id', user!.id)
    if (error) { setSaveError(error.message); setSaving(false); return }
    setAthleteProfile(p => ({ ...p!, ...draftA }))
    setEditingSection(null); setSaving(false)
  }

  // ── Benchmark CRUD ─────────────────────────────────────────────────────────
  async function addLift() {
    if (!newLift.weight_kg) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('benchmark_lifts')
      .insert({ user_id: user!.id, lift_name: newLift.lift_name, weight_kg: parseFloat(newLift.weight_kg), notes: newLift.notes || null, recorded_at: new Date().toISOString().split('T')[0] })
      .select().single()
    if (!error && data) setLifts(l => [...l, data as BenchmarkLift])
    setNewLift({ lift_name: 'clean_and_jerk', weight_kg: '', notes: '' })
    setAddingLift(false); setSaving(false)
  }

  async function deleteLift(id: string) {
    await supabase.from('benchmark_lifts').delete().eq('id', id)
    setLifts(l => l.filter(lift => lift.id !== id))
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-36 bg-ink-black-900 border border-ink-black-700/40 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-cornsilk-500/10 border border-cornsilk-500/30
                        flex items-center justify-center shrink-0">
          <span className="text-cornsilk-400 text-2xl font-bold font-display">
            {profile?.full_name?.charAt(0).toUpperCase() ?? 'A'}
          </span>
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-black-50">{profile?.full_name}</h1>
          <p className="text-ash-grey-600 text-sm">{profile?.email}</p>
        </div>
      </div>

      {/* ── Personal ──────────────────────────────────────────────────────── */}
      <SectionCard title="Personal" editing={editingSection === 'personal'}
        onEdit={() => startEdit('personal')} onSave={savePersonal} onCancel={cancelEdit} saving={saving}>
        {editingSection === 'personal' ? (
          <div className="space-y-4">
            <TextInput label="Full name" value={draftP.full_name ?? ''} onChange={v => setDraftP(p => ({ ...p, full_name: v }))} />
            <TextInput label="Timezone" value={draftP.timezone ?? ''} onChange={v => setDraftP(p => ({ ...p, timezone: v }))} placeholder="e.g. Europe/London" />
          </div>
        ) : (
          <>
            <Row label="Name"     value={profile?.full_name ?? '—'} />
            <Row label="Email"    value={profile?.email ?? '—'} />
            <Row label="Timezone" value={profile?.timezone ?? '—'} />
          </>
        )}
      </SectionCard>

      {/* ── Sport Levels ──────────────────────────────────────────────────── */}
      <SectionCard title="Sport Levels" editing={editingSection === 'levels'}
        onEdit={() => startEdit('levels')} onSave={saveAthlete} onCancel={cancelEdit} saving={saving}>
        {editingSection === 'levels' ? (
          <div className="space-y-4">
            <PillSelect label="CrossFit"        options={CROSSFIT_OPTIONS} value={draftA.crossfit_level} onChange={v => setDraftA(p => ({ ...p, crossfit_level: v as AthleteProfile['crossfit_level'] }))} />
            <PillSelect label="Olympic Lifting" options={LIFTING_OPTIONS}  value={draftA.lifting_level}  onChange={v => setDraftA(p => ({ ...p, lifting_level: v as AthleteProfile['lifting_level'] }))} />
            <PillSelect label="Running"         options={RUNNING_OPTIONS}  value={draftA.running_level}  onChange={v => setDraftA(p => ({ ...p, running_level: v as AthleteProfile['running_level'] }))} />
          </div>
        ) : (
          <>
            <Row label="CrossFit"        value={fmt(athleteProfile?.crossfit_level)} />
            <Row label="Lifting"         value={fmt(athleteProfile?.lifting_level)} />
            <Row label="Running"         value={fmt(athleteProfile?.running_level)} />
          </>
        )}
      </SectionCard>

      {/* ── Training Schedule ─────────────────────────────────────────────── */}
      <SectionCard title="Training Schedule" editing={editingSection === 'schedule'}
        onEdit={() => startEdit('schedule')} onSave={saveAthlete} onCancel={cancelEdit} saving={saving}>
        {editingSection === 'schedule' ? (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-ash-grey-600 mb-2">Training days</p>
              <div className="flex gap-2">
                {WEEK_DAYS.map(({ l, v }) => {
                  const sel = (draftA.typical_training_days ?? []).includes(v)
                  return (
                    <button key={v} type="button" onClick={() => toggleDraftDay(v)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold font-display transition-all
                        ${sel ? 'bg-cerulean-500 text-ink-black-950'
                              : 'bg-ink-black-800 text-ash-grey-500 border border-ink-black-700/50'}`}>{l}
                    </button>
                  )
                })}
              </div>
            </div>
            <PillSelect label="Session length" options={DURATION_OPTIONS}
              value={draftA.typical_session_duration_mins}
              onChange={v => setDraftA(p => ({ ...p, typical_session_duration_mins: Number(v) }))}
              fmt={v => `${v} min`} />
          </div>
        ) : (
          <>
            <Row label="Days" value={
              (athleteProfile?.typical_training_days ?? []).length > 0
                ? [...(athleteProfile?.typical_training_days ?? [])].sort().map(d => DAY_ABBR[d]).join(', ')
                : '—'
            } />
            <Row label="Session length" value={
              athleteProfile?.typical_session_duration_mins
                ? `${athleteProfile.typical_session_duration_mins} min` : '—'
            } />
          </>
        )}
      </SectionCard>

      {/* ── Goal ──────────────────────────────────────────────────────────── */}
      <SectionCard title="Primary Goal" editing={editingSection === 'goal'}
        onEdit={() => startEdit('goal')} onSave={saveAthlete} onCancel={cancelEdit} saving={saving}>
        {editingSection === 'goal' ? (
          <PillSelect label="Goal" options={GOAL_OPTIONS} value={draftA.primary_goal}
            onChange={v => setDraftA(p => ({ ...p, primary_goal: v }))} />
        ) : (
          <Row label="Goal" value={fmt(athleteProfile?.primary_goal)} />
        )}
      </SectionCard>

      {/* ── Benchmark Lifts ───────────────────────────────────────────────── */}
      <div className="bg-ink-black-900 border border-ink-black-700/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-ink-black-400">Benchmark Lifts</h2>
          <button onClick={() => setAddingLift(a => !a)}
            className="text-xs text-cerulean-400 hover:text-cerulean-300 font-medium transition-colors">
            {addingLift ? 'Cancel' : '+ Add lift'}
          </button>
        </div>

        {lifts.length === 0 && !addingLift ? (
          <p className="text-ash-grey-700 text-sm">No benchmarks recorded yet.</p>
        ) : (
          <div className="space-y-0 mb-4">
            {lifts.map(lift => (
              <div key={lift.id}
                className="flex items-center justify-between py-2.5 border-b border-ink-black-800/50 last:border-0">
                <div>
                  <span className="text-sm font-medium text-ink-black-200">{fmt(lift.lift_name)}</span>
                  {lift.notes && <span className="text-xs text-ash-grey-700 ml-2">{lift.notes}</span>}
                </div>
                <div className="flex items-center gap-4">
                  {/* Cornsilk gold weight number */}
                  <span className="font-display font-bold text-cornsilk-400">{lift.weight_kg} kg</span>
                  <span className="text-xs text-ash-grey-800">{lift.recorded_at}</span>
                  <button onClick={() => deleteLift(lift.id)}
                    className="text-xs text-ash-grey-800 hover:text-red-400 transition-colors">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add lift form */}
        {addingLift && (
          <div className="mt-4 pt-4 border-t border-ink-black-800/50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-ash-grey-600 mb-1.5">Lift</label>
                <select value={newLift.lift_name} onChange={e => setNewLift(p => ({ ...p, lift_name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg bg-ink-black-800 border border-ink-black-700/60
                             text-ink-black-100 text-sm focus:outline-none focus:ring-2 focus:ring-cerulean-500 transition">
                  {LIFT_NAMES.map(n => <option key={n} value={n}>{fmt(n)}</option>)}
                </select>
              </div>
              <TextInput label="Weight (kg)" type="number" value={newLift.weight_kg}
                onChange={v => setNewLift(p => ({ ...p, weight_kg: v }))} placeholder="0" />
            </div>
            <TextInput label="Notes (optional)" value={newLift.notes}
              onChange={v => setNewLift(p => ({ ...p, notes: v }))} placeholder="e.g. belt used" />
            <button onClick={addLift} disabled={!newLift.weight_kg || saving}
              className="w-full py-2 rounded-lg bg-cerulean-500 hover:bg-cerulean-400
                         text-ink-black-950 font-semibold text-sm transition-colors
                         disabled:opacity-30 disabled:cursor-not-allowed">
              {saving ? 'Adding…' : 'Add lift'}
            </button>
          </div>
        )}
      </div>

      {/* ── Notes for AI ──────────────────────────────────────────────────── */}
      <SectionCard title="Notes for the AI" editing={editingSection === 'notes'}
        onEdit={() => startEdit('notes')} onSave={saveAthlete} onCancel={cancelEdit} saving={saving}>
        {editingSection === 'notes' ? (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-ash-grey-600 mb-1.5">Notes</label>
            <textarea value={draftA.notes ?? ''} onChange={e => setDraftA(p => ({ ...p, notes: e.target.value }))}
              placeholder="Anything the AI should know — injuries, preferences, life context…"
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg bg-ink-black-800 border border-ink-black-700/60
                         text-ink-black-100 placeholder-ash-grey-700 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-cerulean-500 transition" />
          </div>
        ) : (
          <p className="text-sm text-ink-black-300 leading-relaxed">
            {athleteProfile?.notes ?? <span className="text-ash-grey-800">Nothing added yet.</span>}
          </p>
        )}
      </SectionCard>

      {saveError && <p className="text-cornsilk-400 text-sm text-center">{saveError}</p>}
    </div>
  )
}
