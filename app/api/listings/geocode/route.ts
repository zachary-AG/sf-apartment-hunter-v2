import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { geocodeAddress } from '@/lib/geocode'
import { calculateCommuteBothModes } from '@/lib/commute'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id, address } = await req.json() as { listing_id?: string; address?: string }
  if (!listing_id || !address) {
    return NextResponse.json({ error: 'listing_id and address are required' }, { status: 400 })
  }

  const coords = await geocodeAddress(address)
  if (!coords) {
    return NextResponse.json({ lat: null, lng: null })
  }

  const supabase = createServerSupabaseClient()

  // Fetch user work address for commute calculation
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('work_lat, work_lng')
    .eq('user_id', userId)
    .maybeSingle()

  let commuteTimes = { commute_minutes_transit: null as number | null, commute_minutes_walking: null as number | null }
  if (prefs?.work_lat && prefs?.work_lng) {
    commuteTimes = await calculateCommuteBothModes(prefs.work_lat, prefs.work_lng, coords.lat, coords.lng)
  }

  await supabase
    .from('listings')
    .update({ lat: coords.lat, lng: coords.lng, ...commuteTimes })
    .eq('id', listing_id)
    .eq('user_id', userId)

  return NextResponse.json({ ...coords, ...commuteTimes })
}
