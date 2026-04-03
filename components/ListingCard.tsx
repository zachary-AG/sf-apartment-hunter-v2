'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { StatusBadge } from './StatusBadge'
import type { Listing, ListingCommute } from '@/types'

const AMENITY_LABELS: Record<string, string> = {
  in_unit_laundry: 'W/D in unit',
  dishwasher: 'Dishwasher',
  parking: 'Parking',
  gym: 'Gym',
  doorman: 'Doorman',
  pet_friendly: 'Pets OK',
  ac: 'A/C',
  balcony: 'Balcony',
  hardwood_floors: 'Hardwood',
  storage: 'Storage',
}

interface ListingCardProps {
  listing: Listing
  commutes: ListingCommute[]
  listId: string
  onDelete: (id: string) => void
  onHover?: (id: string | null) => void
}

const COMMUTE_COLORS = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4']

export function ListingCard({ listing, commutes, listId, onDelete, onHover }: ListingCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [imgIndex, setImgIndex] = useState(0)
  const [imgHovered, setImgHovered] = useState(false)

  const images = listing.images ?? []
  const hasMultiple = images.length > 1
  const thumbnail = images[imgIndex] ?? images[0]

  const amenityKeys = listing.amenities
    ? (Object.entries(listing.amenities) as [string, boolean | null][])
        .filter(([, v]) => v === true)
        .map(([k]) => k)
    : []
  const visibleAmenities = amenityKeys.slice(0, 4)
  const extraCount = amenityKeys.length - visibleAmenities.length

  function prev(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setImgIndex(i => (i - 1 + images.length) % images.length)
  }

  function next(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setImgIndex(i => (i + 1) % images.length)
  }

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/listings/${listing.id}`, { method: 'DELETE' })
    onDelete(listing.id)
  }

  const priceText = listing.price
    ? listing.price_max && listing.price_max !== listing.price
      ? `$${listing.price.toLocaleString()}–$${listing.price_max.toLocaleString()}/mo`
      : `$${listing.price.toLocaleString()}/mo`
    : null

  const displayTitle = listing.title || listing.address
  const showAddress = listing.title && listing.address && listing.title !== listing.address

  const detailCells: { label: string; value: string }[] = []
  if (priceText) detailCells.push({ label: 'Price', value: priceText })
  if (listing.beds != null || listing.baths != null) {
    const bedBath = [
      listing.beds != null ? `${listing.beds}bd` : null,
      listing.baths != null ? `${listing.baths}ba` : null,
    ].filter(Boolean).join(' ')
    detailCells.push({ label: 'Beds/Baths', value: bedBath })
  }

  return (
    <div
      className="relative mx-3 mb-2 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/60 transition-all cursor-pointer group overflow-hidden"
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Delete button */}
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirming(true) }}
        className="absolute top-2 right-2 z-10 text-zinc-200 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
        title="Delete listing"
      >
        <TrashIcon />
      </button>

      <Link href={`/dashboard/${listId}/${listing.id}`} className="flex min-w-0">
        {/* Image */}
        <div
          className="relative flex-shrink-0 bg-zinc-100 overflow-hidden self-stretch"
          style={{ width: '35%' }}
          onMouseEnter={() => setImgHovered(true)}
          onMouseLeave={() => setImgHovered(false)}
        >
          {thumbnail ? (
            <>
              <Image
                src={thumbnail}
                alt={displayTitle}
                fill
                className="object-cover object-center"
                unoptimized
              />
              {hasMultiple && imgHovered && (
                <>
                  <button onClick={prev} className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors" aria-label="Previous image">
                    <ChevronLeft size={9} />
                  </button>
                  <button onClick={next} className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors" aria-label="Next image">
                    <ChevronRight size={9} />
                  </button>
                  <div className="absolute bottom-1 right-1 text-white text-[9px] font-medium bg-black/50 rounded px-1 leading-4">
                    {imgIndex + 1}/{images.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 px-3 py-2.5 pr-7 flex flex-col justify-between">
          {/* Title + address + attribution */}
          <div className="min-w-0 mb-2">
            <p className="text-[13px] font-semibold text-zinc-900 truncate leading-snug">{displayTitle}</p>
            {showAddress && (
              <p className="text-[11px] text-zinc-400 truncate mt-0.5 leading-snug">{listing.address}</p>
            )}
            {listing.added_by_name && (
              <p className="text-[10px] text-zinc-400 mt-0.5">Added by {listing.added_by_name}</p>
            )}
          </div>

          {/* Detail grid */}
          {detailCells.length > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2">
              {detailCells.map(cell => (
                <div key={cell.label} className="flex flex-col min-w-0">
                  <span className="text-[10px] text-zinc-400 leading-tight">{cell.label}</span>
                  <span className="text-[12px] font-medium text-zinc-700 truncate leading-snug">{cell.value}</span>
                </div>
              ))}
              {!priceText && (
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-zinc-400 leading-tight">Price</span>
                  <span className="text-[12px] text-zinc-400 leading-snug">Awaiting</span>
                </div>
              )}
            </div>
          )}

          {/* Commute — per-member rows */}
          {commutes.length > 0 && (
            <div className="mb-1.5 flex flex-col gap-0.5">
              {commutes.map((c, i) => {
                if (c.minutes_transit == null && c.minutes_walking == null) return null
                const color = COMMUTE_COLORS[i % COMMUTE_COLORS.length]
                return (
                  <div key={c.user_id} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[10px] font-medium text-zinc-500 truncate max-w-[60px]">{c.display_name}</span>
                    {c.minutes_transit != null && (
                      <span className="text-[11px] text-zinc-600">🚇 {c.minutes_transit}m</span>
                    )}
                    {c.minutes_walking != null && (
                      <span className="text-[11px] text-zinc-600">🚶 {c.minutes_walking}m</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Bottom row: status + amenity pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={listing.status} />
            {visibleAmenities.map(key => (
              <span key={key} className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                {AMENITY_LABELS[key] ?? key}
              </span>
            ))}
            {extraCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                +{extraCount} more
              </span>
            )}
          </div>
        </div>
      </Link>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirming(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-900 mb-2">Delete listing?</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Are you sure you want to delete this listing? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-600 text-white rounded px-3 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => setConfirming(false)} className="flex-1 border border-zinc-200 rounded px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChevronLeft({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}
