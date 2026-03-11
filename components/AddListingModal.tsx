'use client'

import { useState } from 'react'
import { OutreachModal } from './OutreachModal'
import { CompleteListingModal } from './CompleteListingModal'
import type { Listing, ParsedListing } from '@/types'

interface AddListingModalProps {
  onClose: () => void
  onAdded: (listing: Listing) => void
}

interface IncompletePayload {
  missingFields: ('address' | 'beds' | 'baths' | 'price')[]
  partialData: ParsedListing
  url: string
  source: string
}

type Step = 'fetching' | 'extracting' | 'geocoding' | 'saving'

// Only show 2 user-visible steps — geocoding/saving complete too fast to be worth displaying
const DISPLAY_STEPS: { keys: Step[]; label: string }[] = [
  { keys: ['fetching'],                      label: 'Fetching page' },
  { keys: ['extracting', 'geocoding', 'saving'], label: 'Extracting listing data' },
]

function displayStepIndex(step: Step): number {
  return DISPLAY_STEPS.findIndex(s => s.keys.includes(step))
}

export function AddListingModal({ onClose, onAdded }: AddListingModalProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeStep, setActiveStep] = useState<Step | null>(null)
  const [stepError, setStepError] = useState<{ step: Step | null; message: string } | null>(null)
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string; listingId: string } | null>(null)
  const [incomplete, setIncomplete] = useState<IncompletePayload | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  function handleClose() {
    if (url.trim()) {
      setConfirmCancel(true)
    } else {
      onClose()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setStepError(null)
    setActiveStep('fetching')

    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!res.ok || !res.body) {
        throw new Error('Failed to connect to ingest pipeline')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE lines are separated by \n\n; each line is "data: {...}"
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const block of lines) {
          const dataLine = block.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue
          const json = dataLine.slice(6)
          let event: Record<string, unknown>
          try { event = JSON.parse(json) } catch { continue }

          if (event.step === 'done') {
            if (event.error) {
              setStepError({ step: activeStep, message: event.error as string })
              setLoading(false)
              return
            }
            setLoading(false)
            setActiveStep(null)

            if (event.partialData) {
              setIncomplete({
                missingFields: (event.missingFields as ('address' | 'beds' | 'baths' | 'price')[]) ?? [],
                partialData: event.partialData as ParsedListing,
                url: (event.url as string) ?? url.trim(),
                source: (event.source as string) ?? 'unknown',
              })
              return
            }

            const listing = event.listing as Listing
            onAdded(listing)
            if (event.emailDraft) {
              setEmailDraft({ ...(event.emailDraft as { subject: string; body: string }), listingId: listing.id })
            } else {
              onClose()
            }
            return
          } else {
            setActiveStep(event.step as Step)
          }
        }
      }
    } catch (err) {
      setStepError({ step: activeStep, message: err instanceof Error ? err.message : 'Failed to add listing' })
      setLoading(false)
      setActiveStep(null)
    }
  }

  if (incomplete) {
    return (
      <CompleteListingModal
        missingFields={incomplete.missingFields}
        partialData={incomplete.partialData}
        url={incomplete.url}
        source={incomplete.source}
        onSaved={(listing, draft) => {
          onAdded(listing)
          if (draft) {
            setIncomplete(null)
            setEmailDraft({ ...draft, listingId: listing.id })
          } else {
            onClose()
          }
        }}
        onClose={onClose}
      />
    )
  }

  if (emailDraft) {
    return (
      <OutreachModal
        listingId={emailDraft.listingId}
        subject={emailDraft.subject}
        body={emailDraft.body}
        onClose={onClose}
      />
    )
  }

  const currentDisplayIdx = activeStep ? displayStepIndex(activeStep) : -1
  const progressPct = activeStep ? Math.round(((currentDisplayIdx + 1) / DISPLAY_STEPS.length) * 100) : 0

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-gray-900 text-lg font-semibold">Add Listing</h2>
          <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-600 text-xl">×</button>
        </div>

        {loading ? (
          /* ── Stepper ── */
          <div className="py-2">
            {/* Progress bar */}
            <div className="h-1.5 bg-zinc-100 rounded-full mb-5 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Steps list */}
            <ol className="space-y-3">
              {DISPLAY_STEPS.map((s, i) => {
                const isActive = activeStep != null && s.keys.includes(activeStep)
                const isDone = i < currentDisplayIdx
                return (
                  <li key={s.label} className="flex items-center gap-3">
                    {/* Icon */}
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium transition-colors
                      ${isDone ? 'bg-blue-600 text-white' : isActive ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-400'}`}
                    >
                      {isDone
                        ? '✓'
                        : isActive
                          ? <SpinnerIcon />
                          : i + 1}
                    </span>
                    {/* Label */}
                    <span className={`text-sm transition-colors ${isDone ? 'text-zinc-400' : isActive ? 'text-zinc-900 font-medium' : 'text-zinc-400'}`}>
                      {s.label}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        ) : (
          /* ── Form ── */
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Listing URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://craigslist.org/..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
              <p className="text-xs text-zinc-400 mt-1">Supports Craigslist, Zillow, Apartments.com</p>
            </div>

            {stepError && (
              <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2.5">
                <p className="text-sm text-red-700">{stepError.message}</p>
                <button
                  type="submit"
                  className="mt-1.5 text-xs text-red-600 font-medium hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Add Listing
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>

    {/* Cancel confirmation dialog */}
    {confirmCancel && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-2">Discard listing?</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Are you sure you want to cancel? Any extracted listing data will be lost.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-red-600 text-white rounded px-3 py-2 text-sm font-medium hover:bg-red-700"
            >
              Yes, cancel
            </button>
            <button
              onClick={() => setConfirmCancel(false)}
              className="flex-1 border border-zinc-200 rounded px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Keep editing
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
