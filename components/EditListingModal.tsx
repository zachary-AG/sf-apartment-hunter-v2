'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { Listing, Amenities } from '@/types'

// ─── Image editing ────────────────────────────────────────────────────────────

interface PendingImage {
  /** Stable key for React — object URL for new uploads, src URL for existing */
  key: string
  /** Display src — object URL for new files, original URL for existing */
  src: string
  /** Final URL to save. null while uploading. */
  url: string | null
  uploading: boolean
  error: string | null
}

async function uploadNewImage(
  file: File,
  key: string,
  setImages: React.Dispatch<React.SetStateAction<PendingImage[]>>
) {
  const formData = new FormData()
  formData.append('file', file)
  try {
    const res = await fetch('/api/listings/upload-image', { method: 'POST', body: formData })
    const data = await res.json() as { url?: string; error?: string }
    if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed')
    setImages(prev => prev.map(img => img.key === key ? { ...img, uploading: false, url: data.url! } : img))
  } catch (err) {
    setImages(prev => prev.map(img => img.key === key ? { ...img, uploading: false, error: err instanceof Error ? err.message : 'Upload failed' } : img))
  }
}

function ImageEditor({ images, setImages }: {
  images: PendingImage[]
  setImages: React.Dispatch<React.SetStateAction<PendingImage[]>>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const incoming = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!incoming.length) return
    const newImages: PendingImage[] = incoming.map(f => ({
      key: URL.createObjectURL(f),
      src: URL.createObjectURL(f),
      url: null,
      uploading: true,
      error: null,
    }))
    setImages(prev => [...prev, ...newImages])
    newImages.forEach(img => uploadNewImage(incoming[newImages.indexOf(img)], img.key, setImages))
  }, [setImages])

  function remove(key: string) {
    setImages(prev => {
      const img = prev.find(i => i.key === key)
      // Revoke object URLs for new uploads to free memory
      if (img && img.key.startsWith('blob:')) URL.revokeObjectURL(img.key)
      return prev.filter(i => i.key !== key)
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-3">
      {/* Existing + pending thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(img => (
            <div key={img.key} className="relative w-20 h-20 rounded-lg overflow-hidden border border-zinc-200 flex-shrink-0 group">
              <Image src={img.src} alt="" fill className="object-cover" unoptimized />
              {img.uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>
              )}
              {img.error && (
                <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
                  <span className="text-white text-xs font-bold px-1 text-center leading-tight">{img.error}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(img.key)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80 leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg px-4 py-4 text-center cursor-pointer transition-colors
          ${dragging ? 'border-blue-400 bg-blue-50' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
      >
        <p className="text-sm text-zinc-500">
          Drag & drop images, or <span className="text-blue-600 font-medium">browse</span>
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">JPG, PNG, WEBP, etc.</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => addFiles(e.target.files)} />
      </div>
    </div>
  )
}

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
  const [images, setImages] = useState<PendingImage[]>(() =>
    (listing.images ?? []).map(url => ({ key: url, src: url, url, uploading: false, error: null }))
  )
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
    if (images.some(img => img.uploading)) {
      setError('Please wait for all images to finish uploading.')
      return
    }
    setSaving(true)
    setError(null)
    const title = buildingName.trim() || address.trim()
    const finalImages = images.filter(img => img.url).map(img => img.url!)
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
          images: finalImages,
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

          {/* Photos */}
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Photos</p>
            <ImageEditor images={images} setImages={setImages} />
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
