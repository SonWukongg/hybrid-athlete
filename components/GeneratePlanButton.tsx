'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GeneratePlanButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)

    const res = await fetch('/api/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    const data = await res.json()

    if (!res.ok || !data?.success) {
      setError(data?.error ?? 'Generation failed. Please try again.')
      setGenerating(false)
      return
    }

    router.refresh()
  }

  // Full-screen overlay while generating
  if (generating) {
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
          The AI is analysing your profile and goals to create a personalised plan.
        </p>
        <div className="flex gap-1.5 mt-6">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-cerulean-500 animate-pulse"
              style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-16 text-center">
      <div className="w-14 h-14 rounded-full bg-cornsilk-500/10 border border-cornsilk-500/20
                      flex items-center justify-center mx-auto mb-4 text-2xl">🏋️</div>
      <p className="font-display text-xl font-semibold text-ink-black-300">No training block yet</p>
      <p className="text-ash-grey-600 text-sm mt-2 max-w-xs mx-auto mb-6">
        Your profile is set up. Generate your first AI training block to get started.
      </p>

      {error && (
        <p className="text-cornsilk-400 text-sm mb-4 max-w-sm mx-auto">{error}</p>
      )}

      <button onClick={handleGenerate}
        className="px-6 py-3 rounded-xl bg-cerulean-500 hover:bg-cerulean-400
                   text-ink-black-950 font-semibold text-sm tracking-wide transition-colors">
        Generate My Plan
      </button>
    </div>
  )
}
