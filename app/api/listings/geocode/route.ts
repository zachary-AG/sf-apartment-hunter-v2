import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { geocodeAddress } from '@/lib/geocode'
import { calculateCommutesForListing } from '@/lib/commute'
import { assertListMemberForListing } from '@/lib/list-auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { ListingCommute } from '@/types'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id, address } = await req.json() as { listing_id?: string; address?: string }
  if (!listing_id || !address) {
    return NextResponse.json({ error: 'listing_id and address are required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Verify list membership
  let listId: string
  try {
    listId = await assertListMemberForListing(listing_id, userId, supabase)
  } catch {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const coords = await geocodeAddress(address)
  if (!coords) {
    return NextResponse.json({ lat: null, lng: null, commutes: [] })
  }

  // Update listing coordinates
  await supabase
    .from('listings')
    .update({ lat: coords.lat, lng: coords.lng })
    .eq('id', listing_id)

  // Calculate commutes for all list members
  let commutes: ListingCommute[] = []
  try {
    await calculateCommutesForListing(listing_id, coords.lat, coords.lng, listId, supabase)
    const { data } = await supabase
      .from('listing_commutes')
      .select('listing_id, user_id, display_name, minutes_transit, minutes_walking')
      .eq('listing_id', listing_id)
    commutes = (data ?? []) as ListingCommute[]
  } catch (err) {
    console.error('[Geocode] commute calculation failed:', err)
  }

  return NextResponse.json({ ...coords, commutes })
}
