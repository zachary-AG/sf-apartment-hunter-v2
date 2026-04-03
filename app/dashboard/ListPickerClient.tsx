'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'

interface ListSummary {
  id: string
  name: string
  role: string
  listing_count: number
  member_count: number
}

export function ListPickerClient({ lists: initialLists }: { lists: ListSummary[] }) {
  const [lists, setLists] = useState(initialLists)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const router = useRouter()

  async function handleDelete(id: string) {
    if (!confirm('Delete this list? All listings in it will be permanently removed.')) return
    setDeletingId(id)
    try {
      await fetch(`/api/lists/${id}`, { method: 'DELETE' })
      setLists(prev => prev.filter(l => l.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json() as { list?: { id: string; name: string } }
      if (data.list) {
        router.push(`/dashboard/${data.list.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">Your Lists</h1>
          <div className="flex items-center gap-3">
            <a href="/settings" className="text-[11px] font-medium text-zinc-800 hover:text-zinc-600 transition-colors tracking-wide uppercase">Settings</a>
            <UserButton />
          </div>
        </div>

        <div className="space-y-3">
          {lists.map(list => (
            <div
              key={list.id}
              className="bg-white rounded-lg border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all"
            >
              <a href={`/dashboard/${list.id}`} className="block p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-900">{list.name}</h2>
                  {list.role === 'owner' && (
                    <span className="text-[10px] font-medium text-zinc-400 uppercase">Owner</span>
                  )}
                </div>
                <div className="flex gap-4 mt-1.5 text-xs text-zinc-500">
                  <span>{list.listing_count} listing{list.listing_count !== 1 ? 's' : ''}</span>
                  <span>{list.member_count} member{list.member_count !== 1 ? 's' : ''}</span>
                </div>
              </a>
              {list.role === 'owner' && (
                <div className="px-4 pb-3 flex justify-end">
                  <button
                    onClick={() => handleDelete(list.id)}
                    disabled={deletingId === list.id}
                    className="text-[11px] text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deletingId === list.id ? 'Deleting…' : 'Delete list'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Create new list */}
        <div className="mt-6">
          {creating ? (
            <form onSubmit={handleCreate} className="bg-white rounded-lg border border-zinc-200 p-4 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Mission District Hunt"
                className="w-full border border-zinc-200 rounded px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || !newName.trim()}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create List'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName('') }}
                  className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white rounded-lg px-4 py-2.5 text-[13px] font-medium hover:bg-zinc-700 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              Create New List
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
