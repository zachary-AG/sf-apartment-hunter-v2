import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { calculateCommuteBothModes } from '@/lib/commute'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    listing_id: string
    origin_lat: number
    origin_lng: number
    dest_lat: number
    dest_lng: number
  }

  const { listing_id, origin_lat, origin_lng, dest_lat, dest_lng } = body
  if (!listing_id || origin_lat == null || origin_lng == null || dest_lat == null || dest_lng == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const times = await calculateCommuteBothModes(origin_lat, origin_lng, dest_lat, dest_lng)

  const supabase = createServerSupabaseClient()
  await supabase
    .from('listings')
    .update(times)
    .eq('id', listing_id)
    .eq('user_id', userId)

  return NextResponse.json(times)
}
