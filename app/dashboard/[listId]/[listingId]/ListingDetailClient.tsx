'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ImageCarousel } from '@/components/ImageCarousel'
import { StatusBadge } from '@/components/StatusBadge'
import { EditListingModal } from '@/components/EditListingModal'
import type { Listing, Amenities } from '@/types'

interface ListingDetailClientProps {
  listing: Listing
  listId: string
}

export function ListingDetailClient({ listing: initialListing, listId }: ListingDetailClientProps) {
  const [listing, setListing] = useState(initialListing)
  const [notes, setNotes] = useState(listing.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  async function saveNotes() {
    setSavingNotes(true)
    await fetch(`/api/listings/${listing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setSavingNotes(false)
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Back nav */}
        <Link href={`/dashboard/${listId}`} className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back to dashboard
        </Link>

        <ImageCarousel images={listing.images} alt={listing.title} />

        <div className="mt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{listing.title || listing.address}</h1>
              <p className="text-zinc-500 mt-0.5">{listing.address}</p>
              {listing.neighborhood && (
                <p className="text-sm text-zinc-400">{listing.neighborhood}</p>
              )}
              {listing.added_by_name && (
                <p className="text-xs text-zinc-400 mt-1">Added by {listing.added_by_name}</p>
              )}
            </div>
            <StatusBadge status={listing.status} />
          </div>

          {/* Price + details */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-zinc-500">Price</span>
              <p className="font-semibold text-zinc-900 mt-0.5">
                {listing.price ? `$${listing.price.toLocaleString()}/mo` : 'Awaiting price'}
              </p>
            </div>
            {listing.beds != null && (
              <div>
                <span className="text-zinc-500">Beds</span>
                <p className="font-semibold text-zinc-900 mt-0.5">{listing.beds}</p>
              </div>
            )}
            {listing.baths != null && (
              <div>
                <span className="text-zinc-500">Baths</span>
                <p className="font-semibold text-zinc-900 mt-0.5">{listing.baths}</p>
              </div>
            )}
            {listing.sqft != null && (
              <div>
                <span className="text-zinc-500">Sqft</span>
                <p className="font-semibold text-zinc-900 mt-0.5">{listing.sqft.toLocaleString()}</p>
              </div>
            )}
            {listing.available_date && (
              <div>
                <span className="text-zinc-500">Available</span>
                <p className="font-semibold text-zinc-900 mt-0.5">
                  {new Date(listing.available_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          {/* Amenities */}
          {listing.amenities && (() => {
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
            const present = (Object.entries(listing.amenities) as [keyof Amenities, boolean | null][])
              .filter(([, v]) => v === true)
            const absent = (Object.entries(listing.amenities) as [keyof Amenities, boolean | null][])
              .filter(([, v]) => v === false)
            if (!present.length && !absent.length) return null
            return (
              <div>
                <h2 className="text-sm font-medium text-zinc-700 mb-2">Amenities</h2>
                <div className="flex flex-wrap gap-1.5">
                  {present.map(([key]) => (
                    <span key={key} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {AMENITY_LABELS[key]}
                    </span>
                  ))}
                  {absent.map(([key]) => (
                    <span key={key} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-400 line-through">
                      {AMENITY_LABELS[key]}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Description */}
          {listing.description && (
            <div>
              <h2 className="text-sm font-medium text-zinc-700 mb-1">Description</h2>
              <p className="text-sm text-zinc-600 whitespace-pre-line">{listing.description}</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <h2 className="text-sm font-medium text-zinc-700 mb-1">Notes</h2>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add your notes..."
              className="w-full border text-zinc-700 border-zinc-200 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {savingNotes ? 'Saving...' : 'Save notes'}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer"
            >
              View listing
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit details
            </button>
          </div>
        </div>
      </div>

      {editOpen && (
        <EditListingModal
          listing={listing}
          onSaved={updated => { setListing(updated); setEditOpen(false) }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}
