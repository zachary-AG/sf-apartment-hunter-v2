'use client'

import { useState } from 'react'

interface OutreachModalProps {
  listingId: string
  subject: string
  body: string
  onClose: () => void
  onSent?: () => void
}

export function OutreachModal({ listingId, subject: initialSubject, body: initialBody, onClose, onSent }: OutreachModalProps) {
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, subject, body }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      onSent?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Send Inquiry Email</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full border border-zinc-200 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={8}
              className="w-full border border-zinc-200 rounded px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
