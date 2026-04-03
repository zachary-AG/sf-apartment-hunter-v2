import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { geocodeAddress } from '@/lib/geocode'
import { calculateCommutesForListing } from '@/lib/commute'
import { assertListMember } from '@/lib/list-auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { draftInquiryEmail } from '@/lib/claude'
import type { ParsedListing, ListingCommute } from '@/types'

interface SavePartialBody {
  partialData: ParsedListing
  url: string
  source: string
  list_id: string
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as SavePartialBody
  const { partialData, url, source, list_id: listId } = body

  if (!partialData || !url) {
    return NextResponse.json({ error: 'partialData and url are required' }, { status: 400 })
  }
  if (!listId) {
    return NextResponse.json({ error: 'list_id is required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  try {
    await assertListMember(listId, userId, supabase)
  } catch {
    return NextResponse.json({ error: 'Not a member of this list' }, { status: 403 })
  }

  // Get display name from user_preferences
  const { data: prefsForName } = await supabase
    .from('user_preferences')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()
  const addedByName = prefsForName?.display_name || userId

  // Use lat/lng from partialData if already geocoded, otherwise geocode server-side
  let lat: number | null = partialData.lat ?? null
  let lng: number | null = partialData.lng ?? null
  if ((lat == null || lng == null) && partialData.address) {
    const coords = await geocodeAddress(partialData.address)
    if (coords) {
      lat = coords.lat
      lng = coords.lng
    } else {
      console.warn(`[SavePartial] Geocoding returned no result for: "${partialData.address}"`)
    }
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      user_id: userId,
      list_id: listId,
      added_by_name: addedByName,
      url,
      source,
      title: partialData.title || partialData.address || '',
      address: partialData.address || '',
      neighborhood: partialData.neighborhood || null,
      lat,
      lng,
      price: partialData.price || null,
      price_max: null,
      beds: partialData.beds ?? null,
      baths: partialData.baths ?? null,
      sqft: partialData.sqft ?? null,
      description: partialData.description || null,
      images: partialData.images || [],
      contact_email: partialData.contact_email || null,
      available_date: partialData.available_date || null,
      amenities: partialData.amenities ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[SavePartial] Supabase insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[SavePartial] Listing saved: id=${listing.id}`)

  // Calculate commutes for all list members
  let commutes: ListingCommute[] = []
  if (listing.lat != null && listing.lng != null) {
    try {
      await calculateCommutesForListing(listing.id, listing.lat, listing.lng, listId, supabase)
      const { data } = await supabase
        .from('listing_commutes')
        .select('listing_id, user_id, display_name, minutes_transit, minutes_walking')
        .eq('listing_id', listing.id)
      commutes = (data ?? []) as ListingCommute[]
    } catch (err) {
      console.error('[SavePartial] commute calculation failed:', err)
    }
  }

  // If no price, draft an inquiry email
  if (!listing.price) {
    try {
      const emailDraft = await draftInquiryEmail(listing)
      return NextResponse.json({ listing, commutes, emailDraft })
    } catch {
      return NextResponse.json({ listing, commutes })
    }
  }

  return NextResponse.json({ listing, commutes })
}
