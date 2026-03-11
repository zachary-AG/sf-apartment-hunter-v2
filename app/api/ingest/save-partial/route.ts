import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { geocodeAddress } from '@/lib/geocode'
import { calculateCommuteBothModes } from '@/lib/commute'
import { createServerSupabaseClient } from '@/lib/supabase'
import { draftInquiryEmail } from '@/lib/claude'
import type { ParsedListing } from '@/types'

interface SavePartialBody {
  partialData: ParsedListing
  url: string
  source: string
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as SavePartialBody
  const { partialData, url, source } = body

  if (!partialData || !url) {
    return NextResponse.json({ error: 'partialData and url are required' }, { status: 400 })
  }

  // Use lat/lng from partialData if already geocoded (e.g. from Places Autocomplete),
  // otherwise geocode the address server-side
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

  const supabase = createServerSupabaseClient()
  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      user_id: userId,
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

  // Calculate commute times synchronously so they appear on the card immediately
  let commuteTimes = { commute_minutes_transit: null as number | null, commute_minutes_walking: null as number | null }
  if (listing.lat != null && listing.lng != null) {
    try {
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('work_lat, work_lng')
        .eq('user_id', userId)
        .maybeSingle()
      if (prefs?.work_lat && prefs?.work_lng) {
        commuteTimes = await calculateCommuteBothModes(prefs.work_lat, prefs.work_lng, listing.lat!, listing.lng!)
        await supabase
          .from('listings')
          .update(commuteTimes)
          .eq('id', listing.id)
          .eq('user_id', userId)
      }
    } catch (err) {
      console.error('[SavePartial] commute calculation failed:', err)
    }
  }

  const listingWithCommute = { ...listing, ...commuteTimes }

  // If no price, draft an inquiry email
  if (!listing.price) {
    try {
      const emailDraft = await draftInquiryEmail(listing)
      return NextResponse.json({ listing: listingWithCommute, emailDraft })
    } catch {
      return NextResponse.json({ listing: listingWithCommute })
    }
  }

  return NextResponse.json({ listing: listingWithCommute })
}
