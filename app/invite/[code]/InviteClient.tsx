'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface InviteClientProps {
  listId: string
  listName: string
  inviteCode: string
  memberCount: number
}

export function InviteClient({ listId, listName, inviteCode, memberCount }: InviteClientProps) {
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleJoin() {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/lists/${listId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: inviteCode }),
      })
      const data = await res.json() as { joined?: boolean; already_member?: boolean; error?: string }
      if (!res.ok) {
        setError(data.error || 'Failed to join')
        return
      }
      router.push(`/dashboard/${listId}`)
    } catch {
      setError('Network error — try again')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-blue-600 text-xl">🏠</span>
        </div>
        <h1 className="text-lg font-semibold text-zinc-900 mb-1">Join &ldquo;{listName}&rdquo;</h1>
        <p className="text-sm text-zinc-500 mb-6">
          {memberCount} member{memberCount !== 1 ? 's' : ''} already in this list
        </p>

        {error && (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        )}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {joining ? 'Joining...' : 'Join List'}
        </button>

        <a href="/dashboard" className="block mt-4 text-xs text-zinc-400 hover:text-zinc-600">
          Back to your lists
        </a>
      </div>
    </div>
  )
}
