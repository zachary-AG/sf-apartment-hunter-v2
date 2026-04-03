import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { recalculateUserCommutesAcrossLists } from '@/lib/commute'
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
    display_name?: string
    commute_address?: string
    work_address?: string
    work_lat?: number | null
    work_lng?: number | null
    commute_mode?: string
  }

  const supabase = createServerSupabaseClient()

  // Fetch current prefs to detect work location changes
  const { data: existing } = await supabase
    .from('user_preferences')
    .select('work_lat, work_lng, commute_mode')
    .eq('user_id', userId)
    .maybeSingle()

  // Resolve lat/lng
  let resolvedLat: number | null = body.work_lat ?? null
  let resolvedLng: number | null = body.work_lng ?? null
  if ((resolvedLat == null || resolvedLng == null) && body.work_address) {
    const coords = await geocodeAddress(body.work_address)
    if (coords) { resolvedLat = coords.lat; resolvedLng = coords.lng }
  }

  const upsertPayload: Record<string, unknown> = {
    user_id: userId,
    commute_address: body.commute_address ?? null,
    work_address: body.work_address ?? null,
    work_lat: resolvedLat,
    work_lng: resolvedLng,
    commute_mode: body.commute_mode ?? 'transit',
  }
  if (body.display_name !== undefined) {
    upsertPayload.display_name = body.display_name.trim() || null
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(upsertPayload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If display name changed, retroactively update list_members and listing_commutes
  if (body.display_name !== undefined) {
    const newName = body.display_name.trim() || null
    if (newName) {
      await Promise.all([
        supabase
          .from('list_members')
          .update({ display_name: newName })
          .eq('user_id', userId),
        supabase
          .from('listing_commutes')
          .update({ display_name: newName })
          .eq('user_id', userId),
      ])
    }
  }

  // Recalculate commutes if work location changed
  const workChanged =
    resolvedLat != null && resolvedLng != null &&
    (existing?.work_lat !== resolvedLat || existing?.work_lng !== resolvedLng)

  if (workChanged) {
    const displayName = (data as { display_name?: string | null }).display_name || userId
    recalculateUserCommutesAcrossLists(userId, displayName, resolvedLat!, resolvedLng!, supabase)
      .catch(err => console.error('[Preferences] recalculateUserCommutesAcrossLists failed:', err))
  }

  return NextResponse.json({ preferences: data })
}
