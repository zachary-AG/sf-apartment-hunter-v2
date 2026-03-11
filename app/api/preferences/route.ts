import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { recalculateAllCommutes } from '@/lib/commute'
import { geocodeAddress } from '@/lib/geocode'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  return NextResponse.json({ preferences: data })
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    commute_address?: string
    work_address?: string
    work_lat?: number | null
    work_lng?: number | null
    commute_mode?: string
  }

  const supabase = createServerSupabaseClient()

  // Fetch current prefs to detect work location change
  const { data: existing } = await supabase
    .from('user_preferences')
    .select('work_lat, work_lng, commute_mode')
    .eq('user_id', userId)
    .maybeSingle()

  // Resolve lat/lng: use provided coords, or geocode the address, or fall back to existing coords
  let resolvedLat: number | null = body.work_lat ?? null
  let resolvedLng: number | null = body.work_lng ?? null

  if ((resolvedLat == null || resolvedLng == null) && body.work_address) {
    // No coords provided but address given — geocode server-side
    const coords = await geocodeAddress(body.work_address)
    if (coords) {
      resolvedLat = coords.lat
      resolvedLng = coords.lng
    }
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: userId,
      commute_address: body.commute_address ?? null,
      work_address: body.work_address ?? null,
      work_lat: resolvedLat,
      work_lng: resolvedLng,
      commute_mode: body.commute_mode ?? 'transit',
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalculate commutes if work location changed
  const workLocationChanged =
    resolvedLat != null &&
    resolvedLng != null &&
    (existing?.work_lat !== resolvedLat || existing?.work_lng !== resolvedLng)

  if (workLocationChanged) {
    // Fire and forget — don't block the response
    recalculateAllCommutes(userId, resolvedLat!, resolvedLng!, supabase)
      .catch(err => console.error('[Preferences] recalculateAllCommutes failed:', err))
  }

  return NextResponse.json({ preferences: data })
}
