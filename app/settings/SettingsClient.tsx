'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

interface Suggestion {
  description: string
  placeId: string
}

interface SettingsClientProps {
  gmailEmail: string | null
  commuteAddress: string | null
  workAddress: string | null
  workLat: number | null
  workLng: number | null
  commuteMode: string
}

export function SettingsClient({
  gmailEmail,
  commuteAddress: initialCommute,
  workAddress: initialWorkAddress,
  workLat: initialWorkLat,
  workLng: initialWorkLng,
  commuteMode: initialCommuteMode,
}: SettingsClientProps) {
  const [commuteAddress, setCommuteAddress] = useState(initialCommute || '')
  const [workAddress, setWorkAddress] = useState(initialWorkAddress || '')
  const [workLat, setWorkLat] = useState<number | null>(initialWorkLat)
  const [workLng, setWorkLng] = useState<number | null>(initialWorkLng)
  const [commuteMode, setCommuteMode] = useState(initialCommuteMode || 'transit')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Places autocomplete state
  const [workSuggestions, setWorkSuggestions] = useState<Suggestion[]>([])
  const [showWorkSuggestions, setShowWorkSuggestions] = useState(false)
  const workDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  function handleWorkAddressChange(value: string) {
    setWorkAddress(value)
    // Clear confirmed coords when address text changes
    setWorkLat(null)
    setWorkLng(null)

    if (workDebounceRef.current) clearTimeout(workDebounceRef.current)
    if (!value.trim()) {
      setWorkSuggestions([])
      setShowWorkSuggestions(false)
      return
    }
    workDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(value)}`)
        const data = await res.json() as { suggestions?: Suggestion[] }
        setWorkSuggestions(data.suggestions ?? [])
        setShowWorkSuggestions(true)
      } catch {
        setWorkSuggestions([])
      }
    }, 300)
  }

  async function selectWorkSuggestion(suggestion: Suggestion) {
    setShowWorkSuggestions(false)
    setWorkSuggestions([])

    let lat: number | null = null
    let lng: number | null = null

    try {
      const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`)
      const data = await res.json() as { address?: string; lat?: number; lng?: number }
      // Prefer the formatted address from Places Details
      const finalAddress = data.address || suggestion.description
      setWorkAddress(finalAddress)
      lat = data.lat ?? null
      lng = data.lng ?? null
      setWorkLat(lat)
      setWorkLng(lng)
      // Auto-save immediately after selecting a place
      await doSave(finalAddress, lat, lng, commuteMode)
    } catch {
      setWorkAddress(suggestion.description)
      await doSave(suggestion.description, null, null, commuteMode)
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowWorkSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function doSave(
    addressToSave: string,
    latToSave: number | null,
    lngToSave: number | null,
    modeToSave: string
  ) {
    setSaving(true)
    setSaved(false)
    setSaveError(null)

    try {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commute_address: commuteAddress,
          work_address: addressToSave || null,
          work_lat: latToSave,
          work_lng: lngToSave,
          commute_mode: modeToSave,
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        setSaveError(err.error ?? 'Save failed')
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      setSaveError('Network error — try again')
    }

    setSaving(false)
  }

  async function savePreferences() {
    await doSave(workAddress, workLat, workLng, commuteMode)
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-lg mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
          </div>
          <UserButton />
        </div>

        <div className="space-y-6">
          {/* Gmail Connection */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3">Gmail Connection</h2>
            {gmailEmail ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                  Connected: {gmailEmail}
                </span>
                <a href="/api/gmail/connect" className="text-xs text-zinc-500 hover:text-zinc-700">
                  Reconnect
                </a>
              </div>
            ) : (
              <div>
                <p className="text-sm text-zinc-500 mb-3">
                  Connect Gmail to send inquiry emails and automatically track replies.
                </p>
                <a
                  href="/api/gmail/connect"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  Connect Gmail
                </a>
              </div>
            )}
          </div>

          {/* Commute Settings */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5">
            <h2 className="text-sm font-semibold text-zinc-900 mb-1">Commute Settings</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Set your work address to see commute times on listing cards and the map.
            </p>

            {/* Currently saved address indicator */}
            {initialWorkAddress && (
              <div className="mb-3 flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="text-green-600">✓</span>
                <span>Currently saved: <span className="font-medium text-zinc-700">{initialWorkAddress}</span></span>
              </div>
            )}

            {/* Work Address with Places Autocomplete */}
            <label className="block text-xs font-medium text-zinc-600 mb-1">Work Address</label>
            <div className="relative mb-4" ref={wrapperRef}>
              <input
                type="text"
                value={workAddress}
                onChange={e => handleWorkAddressChange(e.target.value)}
                onFocus={() => workSuggestions.length > 0 && setShowWorkSuggestions(true)}
                placeholder="e.g. 1 Market St, San Francisco, CA"
                className="w-full border text-zinc-600 border-zinc-200 rounded px-3 py-2 text-sm pr-8"
                autoComplete="off"
              />
              {workLat != null && workLng != null && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-600 text-sm font-bold">✓</span>
              )}
              {showWorkSuggestions && workSuggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden">
                  {workSuggestions.map(s => (
                    <li key={s.placeId}>
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); selectWorkSuggestion(s) }}
                        className="w-full text-left px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {s.description}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Commute Mode */}
            <label className="block text-xs font-medium text-zinc-600 mb-2">Commute Mode</label>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setCommuteMode('transit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                  ${commuteMode === 'transit'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
              >
                🚇 Public Transit
              </button>
              <button
                type="button"
                onClick={() => setCommuteMode('walking')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                  ${commuteMode === 'walking'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
              >
                🚶 Walking
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={savePreferences}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">✓ Saved</span>
              )}
              {saveError && (
                <span className="text-sm text-red-600">{saveError}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
