'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ImageCarousel } from '@/components/ImageCarousel'
import { StatusBadge } from '@/components/StatusBadge'
import { OutreachModal } from '@/components/OutreachModal'
import { draftInquiryEmailClient } from '@/lib/claude-client'
import type { Listing, Amenities } from '@/types'

interface ListingDetailClientProps {
  listing: Listing
}

export function ListingDetailClient({ listing: initialListing }: ListingDetailClientProps) {
  const [listing, setListing] = useState(initialListing)
  const [notes, setNotes] = useState(listing.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [outreachModal, setOutreachModal] = useState<{ subject: string; body: string } | null>(null)
  const [draftingEmail, setDraftingEmail] = useState(false)

  async function saveNotes() {
    setSavingNotes(true)
    await fetch(`/api/listings/${listing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setSavingNotes(false)
  }

  async function handleSendInquiry() {
    setDraftingEmail(true)
    try {
      const draft = await draftInquiryEmailClient(listing)
      setOutreachModal(draft)
    } finally {
      setDraftingEmail(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Back nav */}
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Back to dashboard
        </Link>

        {/* Status banner */}
        {listing.status === 'inquiry_sent' && (
          <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
            Inquiry sent — awaiting price reply
            {listing.inquiry_sent_at && (
              <span className="ml-2 text-yellow-600">
                ({new Date(listing.inquiry_sent_at).toLocaleDateString()})
              </span>
            )}
          </div>
        )}
        {listing.status === 'price_received' && listing.price != null && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
            Price confirmed: ${listing.price.toLocaleString()}/mo
          </div>
        )}

        <ImageCarousel images={listing.images} alt={listing.title} />

        <div className="mt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{listing.title || listing.address}</h1>
              <p className="text-zinc-500 mt-0.5">{listing.address}</p>
              {listing.neighborhood && (
                <p className="text-sm text-zinc-400">{listing.neighborhood}</p>
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
              className="px-4 py-2 text-sm text-zinc-700 border border-zinc-200 rounded hover:bg-zinc-50"
            >
              View original listing
            </a>
            {listing.status === 'saved' && (
              <button
                onClick={handleSendInquiry}
                disabled={draftingEmail}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {draftingEmail ? 'Drafting...' : 'Send inquiry'}
              </button>
            )}
          </div>
        </div>
      </div>

      {outreachModal && (
        <OutreachModal
          listingId={listing.id}
          subject={outreachModal.subject}
          body={outreachModal.body}
          onClose={() => setOutreachModal(null)}
          onSent={() => setListing(l => ({ ...l, status: 'inquiry_sent' }))}
        />
      )}
    </div>
  )
}
