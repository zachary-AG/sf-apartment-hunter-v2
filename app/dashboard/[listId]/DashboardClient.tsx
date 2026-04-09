'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Map } from '@/components/Map'
import { ListingCard } from '@/components/ListingCard'
import { AddListingModal } from '@/components/AddListingModal'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import type { Listing, ListMember, ListingCommute } from '@/types'

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <svg className={`animate-spin w-3 h-3 ${dark ? 'text-zinc-600' : 'text-current'}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

interface DashboardClientProps {
  listId: string
  listName: string
  inviteCode: string
  initialListings: Listing[]
  members: ListMember[]
  commutes: Record<string, ListingCommute[]>
  workLocations: { lat: number; lng: number; displayName: string; color: string }[]
  currentUserId: string
}

export function DashboardClient({
  listId,
  listName,
  inviteCode,
  initialListings,
  members,
  commutes: initialCommutes,
  workLocations,
  currentUserId,
}: DashboardClientProps) {
  const [listings, setListings] = useState<Listing[]>(initialListings)
  const [commutes, setCommutes] = useState<Record<string, ListingCommute[]>>(initialCommutes)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCrime, setShowCrime] = useState(false)
  const [showStarredOnly, setShowStarredOnly] = useState(false)
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null)
  const [crimeLoading, setCrimeLoading] = useState(false)
  const [crimeToast, setCrimeToast] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

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
        commutes?: ListingCommute[]
      }
      if (data.lat != null && data.lng != null) {
        setListings(prev =>
          prev.map(l => l.id === listing.id ? { ...l, lat: data.lat!, lng: data.lng! } : l)
        )
        if (data.commutes?.length) {
          setCommutes(prev => ({ ...prev, [listing.id]: data.commutes! }))
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleListingAdded(listing: Listing, newCommutes?: ListingCommute[]) {
    setListings(prev => [listing, ...prev])
    if (newCommutes?.length) {
      setCommutes(prev => ({ ...prev, [listing.id]: newCommutes }))
    }
  }

  function handleDelete(id: string) {
    setListings(prev => prev.filter(l => l.id !== id))
    setCommutes(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function handleStar(id: string, starred: boolean) {
    setListings(prev => prev.map(l => l.id === id ? { ...l, starred } : l))
  }

  async function handleDeleteList() {
    if (!confirm(`Delete "${listName}"? All listings will be permanently removed.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/lists/${listId}`, { method: 'DELETE' })
      router.push('/dashboard')
    } catch {
      setDeleting(false)
    }
  }

  function copyInviteLink() {
    const url = `${window.location.origin}/invite/${inviteCode}`
    navigator.clipboard.writeText(url).then(() => {
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    })
  }

  const hasMultipleMembers = members.length > 1
  const isOwner = members.find(m => m.user_id === currentUserId)?.role === 'owner'
  const visibleListings = showStarredOnly ? listings.filter(l => l.starred) : listings
  const starredCount = listings.filter(l => l.starred).length

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      {/* Left panel */}
      <div className="w-[45%] max-w-[680px] flex-shrink-0 flex flex-col border-r border-zinc-200/80 bg-white shadow-[1px_0_0_0_rgba(0,0,0,0.04)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 text-sm flex-shrink-0">
              ←
            </Link>
            <h1 className="text-[13px] font-semibold tracking-tight text-zinc-900 truncate">{listName}</h1>
            <span className="text-[11px] text-zinc-400 flex-shrink-0">{members.length} member{members.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {isOwner && (
              <button
                onClick={copyInviteLink}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                {inviteCopied ? '✓ Copied!' : 'Invite'}
              </button>
            )}
            {isOwner && (
              <button
                onClick={handleDeleteList}
                disabled={deleting}
                className="text-[11px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete list'}
              </button>
            )}
            <a href="/settings" className="text-[11px] font-medium text-zinc-800 hover:text-zinc-600 transition-colors tracking-wide uppercase">Settings</a>
            <UserButton />
          </div>
        </div>

        {/* Work address nudge */}
        {workLocations.length === 0 && (
          <div className="mx-4 mt-3 mb-1 flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5">
            <span className="text-amber-500 text-base leading-none mt-px">!</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-amber-800 leading-snug">Add your work address</p>
              <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">Commute times won&apos;t show until you set it.</p>
            </div>
            <a href="/settings" className="shrink-0 text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors mt-px">Settings</a>
          </div>
        )}

        {/* Members bar (only show when collaborative) */}
        {hasMultipleMembers && (
          <div className="px-5 py-2 border-b border-zinc-100 flex items-center gap-2 flex-wrap">
            {members.map((m, i) => {
              const COLORS = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4']
              const color = COLORS[i % COLORS.length]
              return (
                <span
                  key={m.user_id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ backgroundColor: color + '18', color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  {m.display_name}{m.user_id === currentUserId ? ' (you)' : ''}
                </span>
              )
            })}
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

        {/* Listing count + filter */}
        {listings.length > 0 && (
          <div className="px-5 pt-3 pb-1 flex items-center justify-between">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              {showStarredOnly ? `${visibleListings.length} starred` : `${listings.length} listing${listings.length !== 1 ? 's' : ''}`}
            </p>
            {starredCount > 0 && (
              <button
                onClick={() => setShowStarredOnly(v => !v)}
                className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                  showStarredOnly
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-zinc-400 hover:text-amber-600'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill={showStarredOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                {showStarredOnly ? 'Starred only' : `${starredCount} starred`}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full pb-16 gap-2 text-center px-8">
              <p className="text-sm font-medium text-zinc-500">No listings yet</p>
              <p className="text-xs text-zinc-400">Paste a Craigslist, Zillow, or Apartments.com URL to get started.</p>
            </div>
          ) : visibleListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full pb-16 gap-2 text-center px-8">
              <p className="text-sm font-medium text-zinc-500">No starred listings</p>
              <p className="text-xs text-zinc-400">Star listings to save your favorites.</p>
            </div>
          ) : (
            <div className="py-2">
              {visibleListings.map(listing => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  commutes={commutes[listing.id] ?? []}
                  listId={listId}
                  onDelete={handleDelete}
                  onStar={handleStar}
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
          listings={visibleListings}
          showCrime={showCrime}
          hoveredListingId={hoveredListingId}
          workLocations={workLocations}
          onCrimeLoadingChange={setCrimeLoading}
          onCrimeError={() => {
            setShowCrime(false)
            setCrimeToast('Could not load crime data — try again')
            setTimeout(() => setCrimeToast(null), 4000)
          }}
        />

        {crimeLoading && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-md border border-zinc-100 text-xs text-zinc-600 font-medium">
            <Spinner dark />
            Loading crime data…
          </div>
        )}

        {crimeToast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-zinc-900 text-white text-xs rounded-xl px-4 py-2.5 shadow-xl">
            {crimeToast}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddListingModal
          listId={listId}
          onClose={() => setShowAddModal(false)}
          onAdded={handleListingAdded}
        />
      )}
    </div>
  )
}
