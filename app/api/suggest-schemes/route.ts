import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

async function queryKnowledge(query: string, matchCount = 4): Promise<{ title: string; content: string }[]> {
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const embedding = await generateEmbedding(query)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient as any).rpc('match_knowledge', {
    query_embedding: JSON.stringify(embedding),
    match_count: matchCount,
  })
  if (error) throw new Error(`KB query failed: ${error.message}`)
  return data ?? []
}

export interface SuggestedScheme {
  movement_id: string
  movement_label: string
  scheme_name: string
  sets: number
  reps: string          // e.g. "5" or "2-3" or "AMRAP"
  progression_type: string
  rationale: string
}

interface RequestBody {
  movements: { id: string; label: string; pattern: string }[]
  goals: string[]
  crossfit_level: string | null
  lifting_level: string | null
  running_level: string | null
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: RequestBody = await request.json()
  const { movements, goals, crossfit_level, lifting_level, running_level } = body

  // RAG — fetch relevant programming rules from KB
  const ragQuery = `hybrid athlete ${goals.join(' ')} ${movements.map(m => m.label).join(' ')} rep schemes programming periodisation`
  let kbArticles: { title: string; content: string }[] = []
  try {
    kbArticles = await queryKnowledge(ragQuery, 4)
    console.log('[suggest-schemes] KB articles:', kbArticles.map(k => k.title))
  } catch (err) {
    console.warn('[suggest-schemes] RAG failed, continuing:', (err as Error).message)
  }

  const kbSection = kbArticles.length > 0
    ? `\n## Programming Guidelines\n${kbArticles.map(k => `### ${k.title}\n${k.content}`).join('\n\n')}\n`
    : ''

  const prompt = `You are an expert hybrid athlete coach. Suggest a rep/set scheme for each of the following key movements.
${kbSection}
Athlete profile:
- Goals: ${goals.join(', ')}
- CrossFit level: ${crossfit_level ?? 'not specified'}
- Lifting level: ${lifting_level ?? 'not specified'}
- Running level: ${running_level ?? 'not specified'}

Movements to programme:
${movements.map(m => `- ${m.label} (${m.pattern} pattern)`).join('\n')}

Return a JSON object with a "schemes" array. Each scheme must have:
- movement_id: the movement id (use the exact id provided)
- movement_label: the movement name
- scheme_name: short name like "Linear 3×5" or "Wave Loading 5×2" or "Tempo Intervals 3×8min"
- sets: number
- reps: string — IMPORTANT: for running movements (5k_time, 10k_time, 400m_pace), reps = duration of ONE single effort (e.g. "8 min", "400 m", "5 min") — never total volume. For lifting, reps = rep count (e.g. "5", "2-3").
- progression_type: one of: linear_percentage, wave_loading, rpe_based, time_based
- rationale: 1-2 sentences explaining why this scheme suits the athlete's goals and level

Running scheme examples (for reference):
- Beginner runner, 5K goal: { sets: 3, reps: "8 min", scheme_name: "Tempo Intervals 3×8min", progression_type: "time_based" }
- Intermediate runner, 5K goal: { sets: 4, reps: "1000 m", scheme_name: "Track Intervals 4×1000m", progression_type: "time_based" }

Movements with their ids:
${movements.map(m => `- id: "${m.id}", label: "${m.label}", pattern: "${m.pattern}"`).join('\n')}

Respond with only valid JSON, no markdown.`

  let raw: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    raw = (message.content[0] as { type: string; text: string }).text
  } catch (err) {
    console.error('[suggest-schemes] Claude error:', err)
    return NextResponse.json({ error: 'Failed to generate scheme suggestions' }, { status: 500 })
  }

  let schemes: SuggestedScheme[]
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    schemes = parsed.schemes
  } catch (err) {
    console.error('[suggest-schemes] JSON parse error:', err, '\nRaw:', raw)
    return NextResponse.json({ error: 'Failed to parse scheme suggestions' }, { status: 500 })
  }

  console.log('[suggest-schemes] Generated schemes:', schemes)
  return NextResponse.json({ schemes })
}
