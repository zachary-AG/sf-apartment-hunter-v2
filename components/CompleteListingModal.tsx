'use client'

import { useEffect, useRef, useState } from 'react'
import type { Listing, ParsedListing, Amenities, ListingCommute } from '@/types'

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

  // Close on outside click
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
    if (!raw.trim()) {
      setSuggestions([])
      setOpen(false)
      return
    }
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
      // Keep the text as-is if details fetch fails
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
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

interface CompleteListingModalProps {
  listId: string
  missingFields: ('address' | 'beds' | 'baths' | 'price')[]
  partialData: ParsedListing
  url: string
  source: string
  onSaved: (listing: Listing, commutes?: ListingCommute[], emailDraft?: { subject: string; body: string }) => void
  onClose: () => void
}

const AMENITY_LABELS: Record<keyof Amenities, string> = {
  in_unit_laundry: 'In-unit laundry',
  dishwasher: 'Dishwasher',
  parking: 'Parking',
  gym: 'Gym',
  doorman: 'Doorman',
  pet_friendly: 'Pet friendly',
  ac: 'A/C',
  balcony: 'Balcony',
  hardwood_floors: 'Hardwood floors',
  storage: 'Storage',
}

function initialAmenityTags(amenities: ParsedListing['amenities']): string[] {
  if (!amenities) return []
  return (Object.entries(amenities) as [keyof Amenities, boolean | null][])
    .filter(([, v]) => v === true)
    .map(([k]) => AMENITY_LABELS[k])
}

const MAX_TEXTAREA_HEIGHT = 240
const MIN_TEXTAREA_HEIGHT = 80

function AutoTextarea({ value, onChange, className }: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden'
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={2}
      className={`${className ?? ''} resize-none`}
      style={{ minHeight: `${MIN_TEXTAREA_HEIGHT}px`, maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
    />
  )
}

async function geocodeAddressString(addr: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(addr)}`)
    const data = await res.json() as { suggestions?: Array<{ description: string; placeId: string }> }
    const placeId = data.suggestions?.[0]?.placeId
    if (!placeId) return null
    const det = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`)
    const detData = await det.json() as { lat?: number | null; lng?: number | null }
    if (detData.lat != null && detData.lng != null) return { lat: detData.lat, lng: detData.lng }
    return null
  } catch {
    return null
  }
}

export function CompleteListingModal({ listId, partialData, url, source, onSaved, onClose }: CompleteListingModalProps) {
  const [address, setAddress] = useState(partialData.address ?? '')
  const [lat, setLat] = useState<number | null>(partialData.lat ?? null)
  const [lng, setLng] = useState<number | null>(partialData.lng ?? null)
  const [buildingName, setBuildingName] = useState(
    partialData.title && partialData.title !== partialData.address ? partialData.title : ''
  )
  const [description, setDescription] = useState(partialData.description ?? '')
  const [price, setPrice] = useState(partialData.price?.toString() ?? '')
  const [beds, setBeds] = useState(partialData.beds?.toString() ?? '')
  const [baths, setBaths] = useState(partialData.baths?.toString() ?? '')
  const [sqft, setSqft] = useState(partialData.sqft?.toString() ?? '')
  const [availableDate, setAvailableDate] = useState(partialData.available_date ?? '')

  // Editable amenity tags (array of strings)
  const [amenityTags, setAmenityTags] = useState<string[]>(() => initialAmenityTags(partialData.amenities))
  const [amenityInput, setAmenityInput] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState<string[] | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // Auto-geocode the pre-filled address on mount so the map preview appears immediately
  useEffect(() => {
    if (address && lat == null && lng == null) {
      geocodeAddressString(address).then(coords => {
        if (coords) {
          setLat(coords.lat)
          setLng(coords.lng)
        }
      })
    }
    // Only run on mount — intentionally omitting address/lat/lng from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const mapEmbedSrc = lat != null && lng != null
    ? `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`
    : null

  function getEmptyFields(): string[] {
    const empty: string[] = []
    if (!address.trim()) empty.push('Address')
    if (!beds.trim()) empty.push('Beds')
    if (!baths.trim()) empty.push('Baths')
    if (!price.trim()) empty.push('Monthly rent')
    if (!sqft.trim()) empty.push('Sqft')
    if (!availableDate) empty.push('Available date')
    if (!description.trim()) empty.push('Description')
    return empty
  }

  function handleSaveClick() {
    const empty = getEmptyFields()
    if (empty.length > 0) {
      setConfirmEmpty(empty)
    } else {
      doSave()
    }
  }

  function handleCancelClick() {
    setConfirmCancel(true)
  }

  function addAmenityTag() {
    const tag = amenityInput.trim()
    if (tag && !amenityTags.includes(tag)) {
      setAmenityTags(prev => [...prev, tag])
    }
    setAmenityInput('')
  }

  function removeAmenityTag(tag: string) {
    setAmenityTags(prev => prev.filter(t => t !== tag))
  }

  async function doSave() {
    setConfirmEmpty(null)
    setSaving(true)
    setError(null)

    const title = buildingName.trim() || address.trim()
    const completed: ParsedListing = {
      ...partialData,
      title: title || undefined,
      address: address.trim() || undefined,
      lat,
      lng,
      description: description.trim() || undefined,
      price: price ? Number(price) : null,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      sqft: sqft ? Number(sqft) : null,
      available_date: availableDate || null,
      // Pass amenity tags as a custom field for the save route
      amenities: amenityTags.length > 0 ? (amenityTags as unknown as Amenities) : null,
    }

    try {
      const res = await fetch('/api/ingest/save-partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partialData: completed, url, source, amenityTags, list_id: listId }),
      })
      const data = await res.json() as { listing?: Listing; commutes?: ListingCommute[]; emailDraft?: { subject: string; body: string }; error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to save listing')
      onSaved(data.listing!, data.commutes, data.emailDraft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-zinc-100">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Confirm listing details</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Review and fill in details, then save.</p>
            </div>
            <button onClick={handleCancelClick} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none ml-4">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Original listing link */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <span className="flex-1 break-all">{url}</span>
              <span className="flex-shrink-0 font-medium">Open ↗</span>
            </a>

            {/* Building info */}
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Building info</p>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Address</label>
                  <AddressAutocomplete
                    value={address}
                    onChange={v => { setAddress(v); setLat(null); setLng(null) }}
                    onSelect={(addr, lat, lng) => { setAddress(addr); setLat(lat); setLng(lng) }}
                    className={inputClass}
                  />
                  {/* Mini map preview */}
                  {mapEmbedSrc && (
                    <div className="mt-1.5 rounded overflow-hidden border border-zinc-200">
                      <iframe
                        width="100%"
                        height="180"
                        style={{ border: 0, display: 'block' }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={mapEmbedSrc}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Building name</label>
                  <input
                    type="text"
                    value={buildingName}
                    onChange={e => setBuildingName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Description</label>
                  <AutoTextarea
                    value={description}
                    onChange={setDescription}
                    className={inputClass}
                  />
                </div>

                {/* Editable amenity tags */}
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Amenities</label>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {amenityTags.map(tag => (
                      <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeAmenityTag(tag)}
                          className="text-green-600 hover:text-green-900 leading-none"
                          aria-label={`Remove ${tag}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={amenityInput}
                      onChange={e => setAmenityInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAmenityTag() } }}
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={addAmenityTag}
                      className="px-3 py-2 text-sm rounded border border-gray-300 text-zinc-600 hover:bg-zinc-50"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Unit details */}
            <div>
              <p className="text-xs font-medium text-zinc-700 uppercase tracking-wide mb-2">Unit details</p>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Beds</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={beds}
                      onChange={e => setBeds(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Baths</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={baths}
                      onChange={e => setBaths(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Sqft</label>
                    <input
                      type="number"
                      min={0}
                      value={sqft}
                      onChange={e => setSqft(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Monthly rent ($)</label>
                  <input
                    type="number"
                    min={0}
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Available date</label>
                  <input
                    type="date"
                    value={availableDate}
                    onChange={e => setAvailableDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-zinc-100">
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleSaveClick}
                disabled={saving}
                className="flex-1 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save listing'}
              </button>
              <button
                onClick={handleCancelClick}
                className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Soft validation confirmation dialog */}
      {confirmEmpty && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-2">Some fields are empty</h3>
            <p className="text-sm text-zinc-600 mb-1">The following fields are empty:</p>
            <ul className="text-sm text-zinc-500 list-disc list-inside mb-4 space-y-0.5">
              {confirmEmpty.map(f => <li key={f}>{f}</li>)}
            </ul>
            <p className="text-sm text-zinc-600 mb-4">Are you sure you want to save without them?</p>
            <div className="flex gap-3">
              <button
                onClick={doSave}
                className="flex-1 bg-blue-600 text-white rounded px-3 py-2 text-sm font-medium hover:bg-blue-700"
              >
                Continue
              </button>
              <button
                onClick={() => setConfirmEmpty(null)}
                className="flex-1 border border-zinc-200 rounded px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      )}

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
