'use client'

import { useEffect, useRef, useState } from 'react'
import type { Listing, Amenities } from '@/types'

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
          setSuggestions([]); setOpen(false)
        }
      } catch {
        setSuggestions([]); setOpen(false)
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
    } catch { /* keep text as-is */ }
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

const AMENITY_KEYS = Object.keys({
  in_unit_laundry: true, dishwasher: true, parking: true, gym: true,
  doorman: true, pet_friendly: true, ac: true, balcony: true,
  hardwood_floors: true, storage: true,
}) as (keyof Amenities)[]

const AMENITY_LABELS: Record<keyof Amenities, string> = {
  in_unit_laundry: 'In-unit laundry', dishwasher: 'Dishwasher', parking: 'Parking',
  gym: 'Gym', doorman: 'Doorman', pet_friendly: 'Pet friendly', ac: 'A/C',
  balcony: 'Balcony', hardwood_floors: 'Hardwood floors', storage: 'Storage',
}

// Convert amenity tags (label strings) back to Amenities object
function tagsToAmenities(tags: string[]): Amenities {
  const result = {} as Amenities
  for (const key of AMENITY_KEYS) {
    result[key] = tags.includes(AMENITY_LABELS[key]) ? true : null
  }
  return result
}

function amenityTagsFromListing(amenities: Amenities | null): string[] {
  if (!amenities) return []
  return AMENITY_KEYS.filter(k => amenities[k] === true).map(k => AMENITY_LABELS[k])
}

interface EditListingModalProps {
  listing: Listing
  onSaved: (updated: Listing) => void
  onClose: () => void
}

export function EditListingModal({ listing, onSaved, onClose }: EditListingModalProps) {
  const [address, setAddress] = useState(listing.address ?? '')
  const [lat, setLat] = useState<number | null>(listing.lat ?? null)
  const [lng, setLng] = useState<number | null>(listing.lng ?? null)
  const [buildingName, setBuildingName] = useState(
    listing.title && listing.title !== listing.address ? listing.title : ''
  )
  const [description, setDescription] = useState(listing.description ?? '')
  const [price, setPrice] = useState(listing.price?.toString() ?? '')
  const [beds, setBeds] = useState(listing.beds?.toString() ?? '')
  const [baths, setBaths] = useState(listing.baths?.toString() ?? '')
  const [sqft, setSqft] = useState(listing.sqft?.toString() ?? '')
  const [availableDate, setAvailableDate] = useState(listing.available_date ?? '')
  const [amenityTags, setAmenityTags] = useState<string[]>(() => amenityTagsFromListing(listing.amenities))
  const [amenityInput, setAmenityInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mapEmbedSrc = lat != null && lng != null
    ? `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`
    : null

  function addAmenityTag() {
    const tag = amenityInput.trim()
    if (tag && !amenityTags.includes(tag)) setAmenityTags(prev => [...prev, tag])
    setAmenityInput('')
  }

  function removeAmenityTag(tag: string) {
    setAmenityTags(prev => prev.filter(t => t !== tag))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const title = buildingName.trim() || address.trim()
    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || listing.title,
          address: address.trim() || listing.address,
          lat,
          lng,
          description: description.trim() || null,
          price: price ? Number(price) : null,
          beds: beds ? Number(beds) : null,
          baths: baths ? Number(baths) : null,
          sqft: sqft ? Number(sqft) : null,
          available_date: availableDate || null,
          amenities: tagsToAmenities(amenityTags),
        }),
      })
      const data = await res.json() as { listing?: Listing; error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      onSaved(data.listing!)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-100">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Edit listing details</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Update any fields, then save.</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Building info */}
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Building info</p>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Address</label>
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
                <input type="text" value={buildingName} onChange={e => setBuildingName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Description</label>
                <AutoTextarea value={description} onChange={setDescription} className={inputClass} />
              </div>
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
                      >×</button>
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
                  >+</button>
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
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Available date</label>
                <input type="date" value={availableDate} onChange={e => setAvailableDate(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100">
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
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
    </div>
  )
}
