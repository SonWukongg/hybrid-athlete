import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectedMovement {
  movement_id:      string
  movement_label:   string
  pattern:          string
  is_running:       boolean
  scheme_name:      string
  sets:             number
  reps:             string
  progression_type: 'linear_percentage' | 'wave_loading' | 'rpe_based' | 'time_based'
  current_value:    string | null
}

interface KBArticle {
  title:    string
  content:  string
  category: string
}

// Block Planner response — no exercises, just structure + session shells
interface BlockPlannerResponse {
  training_block: {
    title:          string
    goal:           string
    sport_focus:    string[]
    duration_weeks: number
    ai_block_plan: {
      phase_overview:    string
      weekly_intent:     { week: number; focus: string; load: string }[]
      programming_notes: string
    }
  }
  weekly_plans: {
    week_number:  number
    weekly_focus: string
    planned_load: string
    ai_notes:     string
  }[]
  sessions: {
    week_number:        number
    title:              string
    session_type:       string
    priority:           string
    day_of_week:        number
    duration_mins:      number
    ai_rationale:       string
    has_spine_anchor:   boolean
    spine_movement_ids: string[]
  }[]
}

// Session Detailer response — exercises only
interface SessionDetailResponse {
  exercises: {
    order_index:    number
    name:           string
    exercise_type:  string
    sets:           number | null
    reps:           number | null
    reps_note:      string | null
    weight_pct_1rm: number | null
    distance_m:     number | null
    duration_secs:  number | null
    pace_per_km:    string | null
    rest_secs:      number | null
    notes:          string | null
  }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextMonday(): string {
  const today = new Date()
  const day = today.getDay()
  const daysUntil = day === 0 ? 1 : 8 - day
  const next = new Date(today)
  next.setDate(today.getDate() + daysUntil)
  return next.toISOString().split('T')[0]
}

function calculateSessionDate(blockStart: string, weekNumber: number, dayOfWeek: number): string {
  const start = new Date(blockStart + 'T00:00:00Z')
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const date = new Date(start)
  date.setUTCDate(start.getUTCDate() + (weekNumber - 1) * 7 + mondayOffset)
  return date.toISOString().split('T')[0]
}

function stripMarkdown(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
}

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-embedding`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`Embedding failed: ${res.status}`)
  return (await res.json()).embedding
}

async function queryKnowledge(
  adminClient:    SupabaseClient,
  queryText:      string,
  filterCategory: string | null = null,
  matchCount = 5
): Promise<KBArticle[]> {
  const embedding = await generateEmbedding(queryText)
  const params = {
    query_embedding: JSON.stringify(embedding),
    match_count:     matchCount,
    ...(filterCategory ? { filter_category: filterCategory } : {}),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient as any).rpc('match_knowledge', params)
  if (error) throw new Error(`KB query failed: ${error.message}`)
  return data ?? []
}

// ─── Progression spine — pure maths, no LLM ──────────────────────────────────

function buildProgressionSpine(
  movements:     SelectedMovement[],
  durationWeeks: number,
  deloadWeeks:   number[]
) {
  return movements
    .filter(m => !m.is_running)
    .map(m => {
      const baseline1rm = parseFloat(m.current_value ?? '0')

      const weeks = Array.from({ length: durationWeeks }, (_, i) => {
        const week     = i + 1
        const isDeload = deloadWeeks.includes(week)

        let pct: number | null
        let targetRpe: number

        if (isDeload) {
          pct = 70; targetRpe = 5
        } else if (m.progression_type === 'linear_percentage') {
          pct       = Math.min(78 + i * 2.5, 90)
          targetRpe = Math.min(6 + Math.floor(i * 0.5), 9)
        } else if (m.progression_type === 'wave_loading') {
          const pos   = i % 3
          const round = Math.floor(i / 3)
          pct       = [75, 80, 85][pos] + round * 2
          targetRpe = [7, 8, 9][pos]
        } else {
          pct       = null
          targetRpe = Math.min(6 + Math.floor(i * 0.4), 9)
        }

        const weight_kg = pct && baseline1rm > 0
          ? Math.round((baseline1rm * pct / 100) / 2.5) * 2.5
          : null

        return {
          week,
          sets:       isDeload ? Math.max(Math.ceil(m.sets * 0.6), 1) : m.sets,
          reps:       m.reps,
          pct_1rm:    pct,
          weight_kg,
          target_rpe: targetRpe,
          ...(isDeload ? { note: 'deload' } : {}),
        }
      })

      return {
        movement:         m.movement_label,
        movement_id:      m.movement_id,
        scheme_name:      m.scheme_name,
        progression_type: m.progression_type,
        baseline_1rm_kg:  baseline1rm,
        weeks,
      }
    })
}

// ─── Stage A: Block Planner prompt ───────────────────────────────────────────

function buildBlockPlannerPrompt(
  athleteProfile:    Record<string, unknown>,
  benchmarkLifts:    Record<string, unknown>[],
  selectedGoals:     string[],
  selectedMovements: SelectedMovement[],
  kbArticles:        KBArticle[]
): { system: string; user: string } {
  const kbSection = kbArticles.map(k => `### ${k.title}\n${k.content}`).join('\n\n')

  // Derive session type distribution from goals
  const isRunningFocused  = selectedGoals.some(g => ['improve_running', 'strength_and_running'].includes(g))
  const isStrengthFocused = selectedGoals.some(g => ['build_strength', 'olympic_lifting'].includes(g))
  const isCrossFitFocused = selectedGoals.includes('crossfit_performance')

  const goalTemplate = isRunningFocused ? `
## GOAL: RUNNING-FOCUSED
Session distribution per week:
- Run sessions: 3 (1 easy aerobic, 1 tempo/interval key session, 1 long run)
- Strength sessions: 2 (split spine movements across both sessions — never stack all movements in one)
- CrossFit sessions: 1 (paired with a strength session or standalone)
- Priority: Running > Strength > CrossFit

Recommended 6-day layout:
Mon — Easy Run (aerobic base, 30–45 min, conversational pace)
Tue — Strength A (Olympic lifts if selected; pair with a short CrossFit conditioning piece if time allows)
Wed — Run: Tempo or Interval (KEY session — structured efforts at threshold or above)
Thu — Strength B (squat/hinge spine movements; pair with CrossFit WOD or EMOM if time allows)
Fri — Accessories / mobility (optional, low intensity)
Sat — Long Run (KEY session — longest effort of the week, easy to moderate pace)
Sun — Rest` : isStrengthFocused ? `
## GOAL: STRENGTH-FOCUSED
Session distribution per week:
- Strength sessions: 3 (built around the user's selected spine movements, spread across the week)
- CrossFit sessions: 2–3
- Run sessions: 1 (easy only, active recovery — never threshold)
- Priority: Strength > CrossFit > Running

Recommended 6-day layout:
Mon — Strength (spine movements — session A)
Tue — CrossFit
Wed — Strength (spine movements — session B)
Thu — CrossFit + Easy Run
Fri — Strength (spine movements — session C)
Sat — CrossFit
Sun — Rest` : isCrossFitFocused ? `
## GOAL: CROSSFIT-FOCUSED
Session distribution per week:
- CrossFit sessions: 3–4 (key sessions with metcons)
- Strength sessions: 1–2 (spine movements as skill/strength pieces)
- Run sessions: 1 (easy, paired with CrossFit or standalone)
- Priority: CrossFit > Strength > Running

Recommended 6-day layout:
Mon — CrossFit (key session)
Tue — Strength (spine movements)
Wed — CrossFit (key session)
Thu — Strength + Easy Run
Fri — CrossFit (key session)
Sat — CrossFit or active recovery
Sun — Rest` : `
## GOAL: BALANCED HYBRID
Session distribution per week:
- Strength sessions: 2–3 (spine movements spread across week)
- CrossFit sessions: 2–3
- Run sessions: 2 (1 easy, 1 threshold)
- Priority: Strength = CrossFit > Running

Recommended 6-day layout:
Mon — CrossFit + Easy Run
Tue — Strength (spine movements — session A)
Wed — CrossFit
Thu — Strength (spine movements — session B)
Fri — CrossFit
Sat — Strength (spine movements — session C, optional) or Long Run
Sun — Rest`

  const system = `You are an expert hybrid athlete coach. Generate a periodised training block structure.

## PROGRAMMING RULES
${goalTemplate}

## MOVEMENT RULES
- Strength sessions are built ONLY around the user's selected spine movements listed below
- Do NOT programme Olympic lifting (snatch, clean & jerk) unless those movements appear in the user's selected movements
- Do NOT programme Back Squat, Deadlift, etc. as Olympic lifting sessions — use session_type "strength"
- session_type must accurately reflect the primary activity: "crossfit" | "olympic_lifting" | "run" | "strength" | "rest" | "active_recovery"
- Only use "olympic_lifting" if snatch or clean & jerk are the primary focus of that session
- SPINE VOLUME CAP: assign a maximum of 2 spine movements per session. If 3+ spine movements are selected, distribute them across separate strength sessions — never stack all of them in one session
- Olympic lifts (Snatch, Clean & Jerk) may be grouped in the same session. Back Squat and Deadlift must go in a separate session from Olympic lifts
- Strength sessions should be paired with a conditioning piece (CrossFit WOD, EMOM, or METCON) or a short easy run where session duration allows, rather than being left as pure-lifting-only sessions

## SCHEDULING RULES
- Minimum 48hr gap between heavy strength sessions
- No threshold run within 6hrs of a heavy session on the same day (easy run after light session is OK)
- Long run = Saturday if training Mon–Sat
- Sunday = rest or easy active recovery only, never a hard session
- Spread strength sessions evenly (e.g. Mon + Thu, not Mon + Tue)

Block length: beginner=4wks (deload wk3) | intermediate=8wks (deload wks 4,8) | advanced=10wks (deload wks 4,8,10)

${kbSection ? `## KNOWLEDGE BASE\n${kbSection}` : ''}

## OUTPUT FORMAT
Return ONLY valid JSON — no markdown, no text outside the object.

IMPORTANT: Generate session shells for WEEKS 1 AND 2 ONLY.
Weeks 3+ are represented only as weekly_plan entries — sessions are generated on demand as the week approaches.
Do NOT include an exercises array.

{
  "training_block": {
    "title": "string",
    "goal": "string",
    "sport_focus": ["crossfit","olympic_lifting","run"],
    "duration_weeks": 8,
    "ai_block_plan": {
      "phase_overview": "string",
      "weekly_intent": [{ "week": 1, "focus": "string", "load": "low|moderate|high|deload" }],
      "programming_notes": "string"
    }
  },
  "weekly_plans": [{
    "week_number": 1,
    "weekly_focus": "string",
    "planned_load": "low|moderate|high|deload",
    "ai_notes": "string"
  }],
  "sessions": [{
    "week_number": 1,
    "title": "string",
    "session_type": "crossfit|olympic_lifting|run|strength|rest|active_recovery",
    "priority": "key|standard|optional",
    "day_of_week": 1,
    "duration_mins": 60,
    "ai_rationale": "string",
    "has_spine_anchor": false,
    "spine_movement_ids": []
  }]
}`

  const movementList = selectedMovements.length > 0
    ? selectedMovements.map(m =>
        m.is_running
          ? `- ${m.movement_label} (${m.pattern}): ${m.scheme_name}, ${m.sets}×${m.reps}, current best: ${m.current_value ?? 'unknown'}`
          : `- ${m.movement_label} (${m.pattern}): ${m.scheme_name}, ${m.sets}×${m.reps}, current 1RM: ${m.current_value ?? 'unknown'} kg`
      ).join('\n')
    : 'None selected'

  const user = `Today: ${new Date().toISOString().split('T')[0]}

## Goals
${selectedGoals.join(', ') || 'Not specified'}

## Key Movements (Progression Spine)
${movementList}

## Athlete Profile
${JSON.stringify(athleteProfile, null, 2)}

## Benchmark Lifts
${benchmarkLifts?.length ? JSON.stringify(benchmarkLifts, null, 2) : 'None recorded.'}`

  return { system, user }
}

// ─── Stage B: Session Detailer prompt (per session) ──────────────────────────

function buildSessionDetailPrompt(
  session:        BlockPlannerResponse['sessions'][number],
  weekPlan:       BlockPlannerResponse['weekly_plans'][number],
  blockOverview:  string,
  athleteProfile: Record<string, unknown>,
  spineAnchors:   { movement: string; sets: number; reps: string; weight_kg: number | null; pct_1rm: number | null; target_rpe: number }[],
  kbArticles:     KBArticle[],
  selectedGoals:  string[]
): { system: string; user: string } {
  const kbSection = kbArticles.map(k => `### ${k.title}\n${k.content}`).join('\n\n')

  const system = `You are an expert hybrid athlete coach detailing a single training session.

Generate the exercise list for this session. Return ONLY valid JSON — no markdown.

Rules:
- SPINE ANCHORS ARE EXCLUDED: Any movements listed under "Spine Anchors" are already prescribed and will be displayed separately. Do NOT add them to the exercises array under any name, label, or variation (e.g. do not add "Back Squat", "Back Squat (SPINE ANCHOR)", or any renamed version). Generate only warm-ups, accessories, and complementary work around them.
- Use weight_pct_1rm for all strength work. Never hardcode kg.
- Use these order_index ranges: warm-up and movement prep = 0–9 | accessories and conditioning = 20–29 | cool-down = 90. Do NOT use 10–19 (reserved for spine anchors inserted by the system).
- Max 4 accessories per session.
- For CrossFit sessions: include a warm-up, skill/strength piece, metcon, and cool-down.
- For run sessions: specify distance_m or duration_secs and pace_per_km.

${kbSection ? `## EXERCISE LIBRARY\n${kbSection}` : ''}

## OUTPUT FORMAT
{ "exercises": [{ "order_index": 0, "name": "string", "exercise_type": "lift|run|row|ski|bike|gymnastics|conditioning|accessory", "sets": null, "reps": null, "reps_note": null, "weight_pct_1rm": null, "distance_m": null, "duration_secs": null, "pace_per_km": null, "rest_secs": null, "notes": null }] }`

  const anchorSection = spineAnchors.length > 0
    ? `\n## Spine Anchors (ALREADY PRESCRIBED — do not include in exercises)\n${spineAnchors.map(a =>
        `- ${a.movement}: ${a.sets}×${a.reps}${a.weight_kg ? ` @ ${a.weight_kg}kg` : a.pct_1rm ? ` @ ${a.pct_1rm}% 1RM` : ''} (target RPE ${a.target_rpe})`
      ).join('\n')}`
    : ''

  const user = `Session to detail:
- Title: ${session.title}
- Type: ${session.session_type}
- Priority: ${session.priority}
- Duration: ${session.duration_mins} min
- Week ${weekPlan.week_number}: ${weekPlan.weekly_focus} (${weekPlan.planned_load} load)
- Block overview: ${blockOverview}
${anchorSection}

## Athlete
- CrossFit: ${athleteProfile.crossfit_level} | Lifting: ${athleteProfile.lifting_level} | Running: ${athleteProfile.running_level}
- Goals: ${selectedGoals.join(', ') || 'not specified'}`
console.log(user)
  return { system, user }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 1. Auth
  const supabase = createServerClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  const body = await request.json()
  const { user_id, selected_goals = [], selected_movements = [] } = body as {
    user_id:            string
    selected_goals:     string[]
    selected_movements: SelectedMovement[]
  }

  if (user_id !== user.id) {
    return NextResponse.json({ error: 'user_id must match authenticated user' }, { status: 403 })
  }

  // 3. Admin client
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 4. Fetch athlete data
  const [{ data: athleteProfile, error: profileErr }, { data: benchmarkLifts }] = await Promise.all([
    adminClient.from('athlete_profiles').select('*').eq('user_id', user_id).single(),
    adminClient.from('benchmark_lifts').select('*').eq('user_id', user_id),
  ])

  if (profileErr || !athleteProfile) {
    return NextResponse.json({ error: 'Athlete profile not found. Complete onboarding first.' }, { status: 404 })
  }

  // 5. RAG — fetch KB for block planning
  const ragQuery = `hybrid athlete ${selected_goals.join(' ')} ${selected_movements.map(m => m.movement_label).join(' ')} programming sequencing`
  let kbRules: KBArticle[] = []

  try {
    kbRules = await queryKnowledge(adminClient, ragQuery, null, 5)
    console.log('[generate-plan] Block planner KB:', kbRules.map(k => k.title))
  } catch (err) {
    console.warn('[generate-plan] RAG failed, continuing:', (err as Error).message)
  }

  // ── Stage A: Block Planner ───────────────────────────────────────────────

  const { system: bpSystem, user: bpUser } = buildBlockPlannerPrompt(
    athleteProfile,
    benchmarkLifts ?? [],
    selected_goals,
    selected_movements,
    kbRules
  )

  let blockPlan: BlockPlannerResponse
  try {
    const msg = await anthropic.messages.create({
      model:         'claude-sonnet-4-6',
      max_tokens:    8000,
      system:        bpSystem,
      messages:      [{ role: 'user', content: bpUser }],
    })
    const raw         = (msg.content[0] as { type: string; text: string }).text
    const stopReason  = msg.stop_reason
    console.log(`[generate-plan] Block planner raw length: ${raw.length} chars, stop_reason: ${stopReason}`)
    if (stopReason === 'max_tokens') {
      console.error('[generate-plan] Block planner hit max_tokens — response truncated')
    }
    blockPlan = JSON.parse(stripMarkdown(raw))
    console.log('[generate-plan] Block plan received:', {
      title:    blockPlan.training_block.title,
      weeks:    blockPlan.training_block.duration_weeks,
      sessions: blockPlan.sessions.length,
    })
  } catch (err) {
    console.error('[generate-plan] Block planner error:', err)
    return NextResponse.json({ error: 'Failed to generate block structure. Please retry.' }, { status: 500 })
  }

  // ── Progression Spine ────────────────────────────────────────────────────

  const deloadWeeks = blockPlan.training_block.ai_block_plan.weekly_intent
    .filter(w => w.load === 'deload')
    .map(w => w.week)

  const progressionSpine = buildProgressionSpine(selected_movements, blockPlan.training_block.duration_weeks, deloadWeeks)
  console.log('[generate-plan] Spine calculated for:', progressionSpine.map(s => s.movement))

  // Week 1 spine lookup: movement_id → week 1 prescription
  const spineWeek1: Record<string, { movement: string; sets: number; reps: string; weight_kg: number | null; pct_1rm: number | null; target_rpe: number }> = {}
  for (const entry of progressionSpine) {
    const w1 = entry.weeks.find(w => w.week === 1)
    if (w1) spineWeek1[entry.movement_id] = {
      movement:  entry.movement,
      sets:      w1.sets,
      reps:      String(w1.reps),
      weight_kg: w1.weight_kg,
      pct_1rm:   w1.pct_1rm,
      target_rpe: w1.target_rpe,
    }
  }

  // ── Write to DB ──────────────────────────────────────────────────────────

  const blockStart = getNextMonday()

  // training_blocks
  const { data: blockRow, error: blockErr } = await adminClient
    .from('training_blocks')
    .insert({
      user_id,
      title:          blockPlan.training_block.title,
      goal:           blockPlan.training_block.goal,
      sport_focus:    blockPlan.training_block.sport_focus,
      duration_weeks: blockPlan.training_block.duration_weeks,
      start_date:     blockStart,
      status:         'active',
      ai_block_plan:  {
        ...blockPlan.training_block.ai_block_plan,
        progression_spine: progressionSpine,
        selected_goals,
        selected_movements,
      },
    })
    .select('id')
    .single()

  if (blockErr || !blockRow) {
    return NextResponse.json({ error: `DB error (training_blocks): ${blockErr?.message}` }, { status: 500 })
  }
  const blockId = blockRow.id

  // weekly_plans
  const weeklyPlanRows = blockPlan.weekly_plans.map(wp => {
    const weekStart = new Date(blockStart + 'T00:00:00Z')
    weekStart.setUTCDate(weekStart.getUTCDate() + (wp.week_number - 1) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
    return {
      block_id:        blockId,
      user_id,
      week_number:     wp.week_number,
      week_start_date: weekStart.toISOString().split('T')[0],
      week_end_date:   weekEnd.toISOString().split('T')[0],
      weekly_focus:    wp.weekly_focus,
      planned_load:    wp.planned_load,
      ai_notes:        wp.ai_notes,
      status:          wp.week_number === 1 ? 'active' : 'upcoming',
    }
  })

  const { data: weekRows, error: weekErr } = await adminClient
    .from('weekly_plans').insert(weeklyPlanRows).select('id, week_number')

  if (weekErr || !weekRows) {
    await adminClient.from('training_blocks').delete().eq('id', blockId)
    return NextResponse.json({ error: `DB error (weekly_plans): ${weekErr?.message}` }, { status: 500 })
  }

  const weekIdMap = new Map<number, string>(weekRows.map(r => [r.week_number, r.id]))

  // sessions (all weeks — shells only)
  const sessionRows = blockPlan.sessions.map(s => ({
    user_id,
    block_id:         blockId,
    weekly_plan_id:   weekIdMap.get(s.week_number) ?? null,
    title:            s.title,
    session_type:     s.session_type,
    priority:         s.priority,
    scheduled_date:   calculateSessionDate(blockStart, s.week_number, s.day_of_week),
    duration_mins:    s.duration_mins,
    status:           'scheduled',
    ai_rationale:     s.ai_rationale,
  }))

  const { data: sessionData, error: sessionErr } = await adminClient
    .from('sessions').insert(sessionRows).select('id')

  if (sessionErr || !sessionData) {
    await adminClient.from('weekly_plans').delete().eq('block_id', blockId)
    await adminClient.from('training_blocks').delete().eq('id', blockId)
    return NextResponse.json({ error: `DB error (sessions): ${sessionErr?.message}` }, { status: 500 })
  }

  // Map session array index → DB id
  const sessionIdMap = new Map<number, string>(sessionData.map((r, i) => [i, r.id]))

  // ── Stage B: Week 1 Session Detail (parallel) ────────────────────────────

  // Fetch exercise KB for Week 1 sessions
  // We fetch a shared set for non-run sessions, then a targeted set for run sessions
  const week1Sessions = blockPlan.sessions
    .map((s, idx) => ({ ...s, arrayIdx: idx }))
    .filter(s => s.week_number === 1)

  const nonRunTypes = Array.from(new Set(
    week1Sessions.filter(s => s.session_type !== 'run').map(s => s.session_type)
  )).join(' ')

  let kbExercises: KBArticle[] = []
  let kbRunning: KBArticle[] = []

  const hasRunSessions = week1Sessions.some(s => s.session_type === 'run')

  try {
    const kbPromises: Promise<KBArticle[]>[] = []

    // General exercise KB for strength/crossfit sessions
    if (nonRunTypes) {
      kbPromises.push(
        queryKnowledge(adminClient, `${nonRunTypes} exercises accessories technique`, 'exercise-library', 5)
      )
    } else {
      kbPromises.push(Promise.resolve([]))
    }

    // Running-specific KB for run sessions
    if (hasRunSessions) {
      const runningLevel = athleteProfile.running_level ?? 'intermediate'
      kbPromises.push(
        queryKnowledge(
          adminClient,
          `running ${runningLevel} threshold tempo interval easy recovery pace hybrid athlete`,
          'exercise-library',
          5
        )
      )
    } else {
      kbPromises.push(Promise.resolve([]))
    }

    const [exerciseResult, runningResult] = await Promise.all(kbPromises)
    kbExercises = exerciseResult
    kbRunning = runningResult

    console.log('[generate-plan] Exercise KB:', kbExercises.map(k => k.title))
    if (kbRunning.length > 0) {
      console.log('[generate-plan] Running KB:', kbRunning.map(k => k.title))
    }
  } catch (err) {
    console.warn('[generate-plan] Exercise KB fetch failed:', (err as Error).message)
  }

  const week1Plan = blockPlan.weekly_plans.find(wp => wp.week_number === 1)!
  const phaseOverview = blockPlan.training_block.ai_block_plan.phase_overview

  // Run Session Detailer in parallel for all Week 1 sessions
  const detailResults = await Promise.allSettled(
    week1Sessions.map(async session => {
      const sessionId = sessionIdMap.get(session.arrayIdx)
      if (!sessionId) return

      const spineAnchors = (session.spine_movement_ids ?? [])
        .map(id => spineWeek1[id])
        .filter(Boolean)

      // Use running KB for run sessions, general exercise KB for everything else
      const sessionKb = session.session_type === 'run' ? kbRunning : kbExercises

      const { system: sdSystem, user: sdUser } = buildSessionDetailPrompt(
        session,
        week1Plan,
        phaseOverview,
        athleteProfile,
        spineAnchors,
        sessionKb,
        selected_goals
      )

      const msg = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system:     sdSystem,
        messages:   [{ role: 'user', content: sdUser }],
      })

      const raw    = (msg.content[0] as { type: string; text: string }).text
      const detail = JSON.parse(stripMarkdown(raw)) as SessionDetailResponse

      // Build a set of normalised spine movement names for duplicate filtering
      const spineNameSet = new Set(spineAnchors.map(a => a.movement.toLowerCase().trim()))

      const exerciseRows = detail.exercises
        .filter(e => {
          // Strip any "(SPINE ANCHOR)" label the LLM may have appended, then normalise
          const normalisedName = e.name
            .replace(/\s*\(spine anchor\)\s*/gi, '')
            .trim()
            .toLowerCase()
          const isSpineDuplicate = spineNameSet.has(normalisedName)
          const isWarmup = /^warm-?up:/i.test(e.name.trim())
          if (isSpineDuplicate && !isWarmup) {
            console.log(`[generate-plan] Filtered spine duplicate from Session Detailer output: "${e.name}"`)
            return false
          }
          return true
        })
        .map(e => {
          // reps DB column is integer — if Claude returns a string (e.g. "21-15-9", "AMRAP"),
          // move it to reps_note and set reps to null to avoid insert failure
          const repsRaw  = e.reps
          const repsInt  = typeof repsRaw === 'number' ? repsRaw
                         : typeof repsRaw === 'string' && /^\d+$/.test(String(repsRaw).trim())
                           ? parseInt(String(repsRaw).trim(), 10)
                           : null
          const repsNote = repsInt === null && repsRaw
            ? String(repsRaw)
            : (e.reps_note ?? null)
          if (repsInt === null && repsRaw) {
            console.log(`[generate-plan] reps "${repsRaw}" is not an integer — moved to reps_note for exercise "${e.name}"`)
          }

          return {
            session_id:     sessionId,
            user_id,
            order_index:    e.order_index,
            name:           e.name,
            exercise_type:  e.exercise_type,
            sets:           e.sets,
            reps:           repsInt,
            reps_note:      repsNote,
            weight_pct_1rm: e.weight_pct_1rm,
            distance_m:     e.distance_m,
            duration_secs:  e.duration_secs,
            pace_per_km:    e.pace_per_km ? String(e.pace_per_km) : null,
            rest_secs:      e.rest_secs,
            notes:          e.notes,
          }
        })

      if (exerciseRows.length > 0) {
        const { error: exErr } = await adminClient.from('exercises').insert(exerciseRows)
        if (exErr) throw new Error(`exercises insert: ${exErr.message}`)
      }

      // Spine anchor exercises — inserted deterministically from spine data
      if (spineAnchors.length > 0) {
        const spineRows = spineAnchors.map((anchor, i) => ({
          session_id:     sessionId,
          user_id,
          order_index:    10 + i,   // after warm-ups (0–9), before accessories (20+)
          name:           anchor.movement,
          exercise_type:  'lift' as const,
          sets:           anchor.sets,
          reps:           null,
          reps_note:      anchor.reps,
          weight_pct_1rm: anchor.pct_1rm,
          distance_m:     null,
          duration_secs:  null,
          pace_per_km:    null,
          rest_secs:      null,
          notes:          `Target RPE ${anchor.target_rpe}${anchor.weight_kg ? ` — ${anchor.weight_kg} kg` : ''}`,
        }))
        const { error: spineErr } = await adminClient.from('exercises').insert(spineRows)
        if (spineErr) throw new Error(`spine exercises insert: ${spineErr.message}`)
      }

      console.log(`[generate-plan] Session "${session.title}" detailed: ${exerciseRows.length} exercises + ${spineAnchors.length} spine anchors`)
    })
  )

  // Log any session detail failures (non-fatal — block + shells are already saved)
  const failures = detailResults.filter(r => r.status === 'rejected')
  if (failures.length > 0) {
    failures.forEach(f => console.error('[generate-plan] Session detail failed:', (f as PromiseRejectedResult).reason))
  }

  const successCount = detailResults.filter(r => r.status === 'fulfilled').length

  console.log('[generate-plan] Complete:', {
    block_id:     blockId,
    weeks:        weeklyPlanRows.length,
    sessions:     sessionRows.length,
    week1_detailed: `${successCount}/${week1Sessions.length}`,
    spine_movements: progressionSpine.length,
    deload_weeks:  deloadWeeks,
  })

  return NextResponse.json({
    success:  true,
    block_id: blockId,
    summary: {
      weeks:           weeklyPlanRows.length,
      sessions:        sessionRows.length,
      week1_detailed:  successCount,
      spine_movements: progressionSpine.length,
    },
  })
}
