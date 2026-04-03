'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'

interface Props {
  children: React.ReactNode
}

export function DisplayNameGate({ children }: Props) {
  const { isLoaded, isSignedIn } = useUser()
  const [status, setStatus] = useState<'loading' | 'needed' | 'done'>('loading')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    fetch('/api/preferences')
      .then(r => r.json())
      .then((data: { preferences?: { display_name?: string | null } }) => {
        if (data.preferences?.display_name) {
          setStatus('done')
        } else {
          setStatus('needed')
        }
      })
      .catch(() => setStatus('done')) // Don't block the app on error
  }, [isLoaded, isSignedIn])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to save')
        setSaving(false)
        return
      }
      setStatus('done')
    } catch {
      setError('Network error — try again')
      setSaving(false)
    }
  }

  // Not signed in or still loading Clerk — just render children
  if (!isLoaded || !isSignedIn) return <>{children}</>

  // Preferences loaded, name exists — render normally
  if (status === 'done') return <>{children}</>

  // Still checking
  if (status === 'loading') return <>{children}</>

  // Name needed — show blocking modal
  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8">
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">What should we call you?</h2>
          <p className="text-sm text-zinc-500 mb-6">
            This name is shown to collaborators on shared lists.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your display name"
              maxLength={60}
              autoFocus
              className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="w-full bg-zinc-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
