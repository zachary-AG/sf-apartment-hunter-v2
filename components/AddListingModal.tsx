'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { OutreachModal } from './OutreachModal'
import { CompleteListingModal } from './CompleteListingModal'
import type { Listing, ParsedListing, ListingCommute } from '@/types'

interface AddListingModalProps {
  listId: string
  onClose: () => void
  onAdded: (listing: Listing, commutes?: ListingCommute[]) => void
}

interface IncompletePayload {
  missingFields: ('address' | 'beds' | 'baths' | 'price')[]
  partialData: ParsedListing
  url: string
  source: string
}

type Step = 'fetching' | 'extracting' | 'geocoding' | 'saving'
type Mode = 'url' | 'manual'

// Only show 2 user-visible steps — geocoding/saving complete too fast to be worth displaying
const DISPLAY_STEPS: { keys: Step[]; label: string }[] = [
  { keys: ['fetching'],                          label: 'Fetching page' },
  { keys: ['extracting', 'geocoding', 'saving'], label: 'Extracting listing data' },
]

function displayStepIndex(step: Step): number {
  return DISPLAY_STEPS.findIndex(s => s.keys.includes(step))
}

// ─── Address autocomplete (shared with CompleteListingModal) ──────────────────

interface Suggestion {
  text: string
  placeId: string
}

function AddressAutocomplete({ value, onChange, onSelect, className }: {
  value: string
  onChange: (v: string) => void
  onSelect: (address: string, lat: number, lng: number) => void
  className?: string
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleInput(raw: string) {
    onChange(raw)
    setActiveIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!raw.trim()) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(raw)}`)
        const data = await res.json() as { suggestions?: Array<{ description: string; placeId: string }> }
        const results = data.suggestions ?? []
        if (results.length) {
          setSuggestions(results.map(s => ({ text: s.description, placeId: s.placeId })))
          setOpen(true)
        } else {
          setSuggestions([])
          setOpen(false)
        }
      } catch {
        setSuggestions([])
        setOpen(false)
      }
    }, 250)
  }

  async function selectSuggestion(s: Suggestion) {
    onChange(s.text)
    setSuggestions([])
    setOpen(false)
    try {
      const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(s.placeId)}`)
      const data = await res.json() as { address?: string; lat?: number | null; lng?: number | null }
      const addr = data.address || s.text
      if (data.lat != null && data.lng != null) {
        onSelect(addr, data.lat, data.lng)
      } else {
        onChange(addr)
      }
    } catch {
      // Keep text as-is
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeIdx]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-[70] left-0 right-0 mt-1 bg-white border border-zinc-200 rounded shadow-lg max-h-48 overflow-y-auto text-sm">
          {suggestions.map((s, i) => (
            <li
              key={s.text}
              onMouseDown={() => selectSuggestion(s)}
              className={`px-3 py-2 cursor-pointer ${i === activeIdx ? 'bg-blue-50 text-blue-900' : 'text-zinc-800 hover:bg-zinc-50'}`}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Image upload area ────────────────────────────────────────────────────────

interface ImageFile {
  file: File
  preview: string  // object URL for thumbnail
  uploading: boolean
  url: string | null  // final Supabase public URL after upload
  error: string | null
}

function ImageUploadArea({ images, onChange }: {
  images: ImageFile[]
  onChange: (images: ImageFile[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const incoming: ImageFile[] = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({
        file: f,
        preview: URL.createObjectURL(f),
        uploading: true,
        url: null,
        error: null,
      }))
    if (incoming.length === 0) return

    const next = [...images, ...incoming]
    onChange(next)

    // Upload each new file
    incoming.forEach(img => {
      uploadFile(img, next, onChange)
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  function removeImage(preview: string) {
    const updated = images.filter(i => i.preview !== preview)
    URL.revokeObjectURL(preview)
    onChange(updated)
  }

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors
          ${dragging ? 'border-blue-400 bg-blue-50' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
      >
        <p className="text-sm text-zinc-500">
          Drag & drop images here, or <span className="text-blue-600 font-medium">browse</span>
        </p>
        <p className="text-xs text-zinc-400 mt-1">JPG, PNG, WEBP, etc.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(img => (
            <div key={img.preview} className="relative w-16 h-16 rounded overflow-hidden border border-zinc-200 flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
              {/* Upload overlay */}
              {img.uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <SpinnerIcon className="w-4 h-4 text-white" />
                </div>
              )}
              {/* Error overlay */}
              {img.error && (
                <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
              )}
              {/* Remove button */}
              {!img.uploading && (
                <button
                  type="button"
                  onClick={() => removeImage(img.preview)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80 leading-none"
                  aria-label="Remove image"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

async function uploadFile(
  img: ImageFile,
  currentList: ImageFile[],
  onChange: (images: ImageFile[]) => void
) {
  const formData = new FormData()
  formData.append('file', img.file)
  try {
    const res = await fetch('/api/listings/upload-image', { method: 'POST', body: formData })
    const data = await res.json() as { url?: string; error?: string }
    if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed')
    // Update the matching entry in the list using the preview URL as key
    onChange(currentList.map(i =>
      i.preview === img.preview ? { ...i, uploading: false, url: data.url! } : i
    ))
  } catch (err) {
    onChange(currentList.map(i =>
      i.preview === img.preview
        ? { ...i, uploading: false, error: err instanceof Error ? err.message : 'Upload failed' }
        : i
    ))
  }
}

// ─── Manual Entry Form ────────────────────────────────────────────────────────

function ManualEntryForm({ listId, onSaved, onClose }: {
  listId: string
  onSaved: (listing: Listing, commutes?: ListingCommute[]) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [price, setPrice] = useState('')
  const [beds, setBeds] = useState('')
  const [baths, setBaths] = useState('')
  const [sqft, setSqft] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<ImageFile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mapEmbedSrc = lat != null && lng != null
    ? `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`
    : null

  // Keep onChange stable so ImageUploadArea doesn't re-render excessively
  const handleImagesChange = useCallback((updated: ImageFile[]) => {
    setImages(updated)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) { setError('Address is required.'); return }

    const stillUploading = images.some(i => i.uploading)
    if (stillUploading) { setError('Please wait for all images to finish uploading.'); return }

    setSaving(true)
    setError(null)

    const uploadedUrls = images.filter(i => i.url).map(i => i.url!)
    const partialData: ParsedListing = {
      title: title.trim() || address.trim(),
      address: address.trim(),
      lat,
      lng,
      price: price ? Number(price) : null,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      sqft: sqft ? Number(sqft) : null,
      description: description.trim() || undefined,
      images: uploadedUrls,
    }

    try {
      const res = await fetch('/api/ingest/save-partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partialData,
          url: sourceUrl.trim() || 'manual',
          source: 'manual',
          list_id: listId,
        }),
      })
      const data = await res.json() as { listing?: Listing; commutes?: ListingCommute[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to save listing')
      onSaved(data.listing!, data.commutes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save listing')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

  return (
    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Building info */}
      <div>
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Building info</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Property name / title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. The Fillmore, Unit 4B"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Address <span className="text-red-400">*</span></label>
            <AddressAutocomplete
              value={address}
              onChange={v => { setAddress(v); setLat(null); setLng(null) }}
              onSelect={(addr, la, ln) => { setAddress(addr); setLat(la); setLng(ln) }}
              className={inputClass}
            />
            {mapEmbedSrc && (
              <div className="mt-1.5 rounded overflow-hidden border border-zinc-200">
                <iframe
                  width="100%"
                  height="160"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={mapEmbedSrc}
                />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Original listing URL (optional)</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Unit details */}
      <div>
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Unit details</p>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Beds</label>
              <input type="number" min={0} step={0.5} value={beds} onChange={e => setBeds(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Baths</label>
              <input type="number" min={0} step={0.5} value={baths} onChange={e => setBaths(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Sqft</label>
              <input type="number" min={0} value={sqft} onChange={e => setSqft(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Monthly rent ($)</label>
            <input type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Images */}
      <div>
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Photos</p>
        <ImageUploadArea images={images} onChange={handleImagesChange} />
      </div>

      {/* Footer actions */}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save listing'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function AddListingModal({ listId, onClose, onAdded }: AddListingModalProps) {
  const [mode, setMode] = useState<Mode>('url')
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
        body: JSON.stringify({ url: url.trim(), list_id: listId }),
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
            const commutes = (event.commutes as ListingCommute[] | undefined) ?? undefined
            onAdded(listing, commutes)
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
        listId={listId}
        missingFields={incomplete.missingFields}
        partialData={incomplete.partialData}
        url={incomplete.url}
        source={incomplete.source}
        onSaved={(listing, commutes, draft) => {
          onAdded(listing, commutes)
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 flex-shrink-0">
          <h2 className="text-gray-900 text-base font-semibold">Add Listing</h2>
          <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
        </div>

        {/* Mode tabs */}
        {!loading && (
          <div className="flex px-5 pt-3 gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`px-3 py-1.5 text-sm rounded font-medium transition-colors
                ${mode === 'url' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'}`}
            >
              Auto-Import (URL)
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`px-3 py-1.5 text-sm rounded font-medium transition-colors
                ${mode === 'manual' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'}`}
            >
              Manual Entry
            </button>
          </div>
        )}

        {/* Body */}
        {mode === 'manual' ? (
          <ManualEntryForm
            listId={listId}
            onSaved={(listing, commutes) => { onAdded(listing, commutes); onClose() }}
            onClose={onClose}
          />
        ) : loading ? (
          /* ── Stepper ── */
          <div className="p-5 py-4">
            <div className="h-1.5 bg-zinc-100 rounded-full mb-5 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <ol className="space-y-3">
              {DISPLAY_STEPS.map((s, i) => {
                const isActive = activeStep != null && s.keys.includes(activeStep)
                const isDone = i < currentDisplayIdx
                return (
                  <li key={s.label} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium transition-colors
                      ${isDone ? 'bg-blue-600 text-white' : isActive ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-400'}`}
                    >
                      {isDone ? '✓' : isActive ? <SpinnerIcon className="w-3 h-3" /> : i + 1}
                    </span>
                    <span className={`text-sm transition-colors ${isDone ? 'text-zinc-400' : isActive ? 'text-zinc-900 font-medium' : 'text-zinc-400'}`}>
                      {s.label}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        ) : (
          /* ── URL form ── */
          <form onSubmit={handleSubmit} className="p-5 space-y-3">
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
                <button type="submit" className="mt-1.5 text-xs text-red-600 font-medium hover:underline">
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

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? 'w-3 h-3'}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
