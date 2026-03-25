'use client'

import { useEffect, useState } from 'react'
import { Map } from '@/components/Map'
import { ListingCard } from '@/components/ListingCard'
import { AddListingModal } from '@/components/AddListingModal'
import { UserButton } from '@clerk/nextjs'
import type { Listing } from '@/types'

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <svg className={`animate-spin w-3 h-3 ${dark ? 'text-zinc-600' : 'text-current'}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

interface DashboardClientProps {
  initialListings: Listing[]
  workLocation: { lat: number; lng: number } | null
}

export function DashboardClient({ initialListings, workLocation }: DashboardClientProps) {
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCrime, setShowCrime] = useState(false)
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null)
  const [crimeLoading, setCrimeLoading] = useState(false)
  const [crimeToast, setCrimeToast] = useState<string | null>(null)

  // Geocode any listings that are missing lat/lng
  useEffect(() => {
    const ungeocoded = listings.filter(l => l.lat == null && l.address)
    if (ungeocoded.length === 0) return

    ungeocoded.forEach(async (listing) => {
      const res = await fetch('/api/listings/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id, address: listing.address }),
      })
      const data = await res.json() as {
        lat?: number | null
        lng?: number | null
        commute_minutes_transit?: number | null
        commute_minutes_walking?: number | null
      }
      if (data.lat != null && data.lng != null) {
        setListings(prev =>
          prev.map(l => l.id === listing.id ? {
            ...l,
            lat: data.lat!,
            lng: data.lng!,
            commute_minutes_transit: data.commute_minutes_transit ?? l.commute_minutes_transit,
            commute_minutes_walking: data.commute_minutes_walking ?? l.commute_minutes_walking,
          } : l)
        )
      }
    })
  // Run once on mount — intentionally not re-running when listings changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleListingAdded(listing: Listing) {
    setListings(prev => [listing, ...prev])
  }

  function handleDelete(id: string) {
    setListings(prev => prev.filter(l => l.id !== id))
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      {/* Left panel — 45% width */}
      <div className="w-[45%] max-w-[680px] flex-shrink-0 flex flex-col border-r border-zinc-200/80 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.04)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div>
            <h1 className="text-[13px] font-semibold tracking-tight text-zinc-900">SF Apartment Hunter</h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/settings" className="text-[11px] font-medium text-zinc-800 hover:text-zinc-600 transition-colors tracking-wide uppercase">Settings</a>
            <UserButton />
          </div>
        </div>

        {/* Work address nudge */}
        {!workLocation && (
          <div className="mx-4 mt-3 mb-1 flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5">
            <span className="text-amber-500 text-base leading-none mt-px">!</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-amber-800 leading-snug">Add your work address</p>
              <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">Commute times won&apos;t show until you set it.</p>
            </div>
            <a href="/settings" className="shrink-0 text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors mt-px">Settings</a>
          </div>
        )}

        {/* Add Listing */}
        <div className="px-5 py-3 border-b border-zinc-100">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white rounded-lg px-4 py-2.5 text-[13px] font-medium hover:bg-zinc-700 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Add Listing
          </button>
        </div>

        {/* Listing count */}
        {listings.length > 0 && (
          <div className="px-5 pt-3 pb-1">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{listings.length} listing{listings.length !== 1 ? 's' : ''}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full pb-16 gap-2 text-center px-8">
              <p className="text-sm font-medium text-zinc-500">No listings yet</p>
              <p className="text-xs text-zinc-400">Paste a Craigslist, Zillow, or Apartments.com URL to get started.</p>
            </div>
          ) : (
            <div className="py-2">
              {listings.map(listing => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  onDelete={handleDelete}
                  onHover={setHoveredListingId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map panel */}
      <div className="flex-1 relative">
        {/* Overlay toggles */}
        <div className="absolute top-4 right-4 z-10 flex gap-1.5">
          <button
            onClick={() => setShowCrime(v => !v)}
            disabled={crimeLoading}
            className={`min-w-[68px] px-3.5 py-2 rounded-lg text-[12px] font-medium shadow-sm border flex items-center justify-center gap-1.5 transition-all
              ${showCrime
                ? 'bg-red-500 text-white border-red-500 shadow-red-200'
                : 'bg-white/95 text-zinc-700 border-zinc-200/80 hover:bg-white'}
              ${crimeLoading ? 'opacity-75 cursor-default' : ''}`}
          >
            {crimeLoading ? (
              <>
                <Spinner />
                <span>Crime</span>
              </>
            ) : 'Crime'}
          </button>
        </div>

        <Map
          listings={listings}
          showCrime={showCrime}
          hoveredListingId={hoveredListingId}
          workLocation={workLocation}
          onCrimeLoadingChange={setCrimeLoading}
          onCrimeError={() => {
            setShowCrime(false)
            setCrimeToast('Could not load crime data — try again')
            setTimeout(() => setCrimeToast(null), 4000)
          }}
        />

        {/* Crime loading overlay */}
        {crimeLoading && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-md border border-zinc-100 text-xs text-zinc-600 font-medium">
            <Spinner dark />
            Loading crime data…
          </div>
        )}

        {/* Toast */}
        {crimeToast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-zinc-900 text-white text-xs rounded-xl px-4 py-2.5 shadow-xl">
            {crimeToast}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddListingModal
          onClose={() => setShowAddModal(false)}
          onAdded={handleListingAdded}
        />
      )}
    </div>
  )
}
