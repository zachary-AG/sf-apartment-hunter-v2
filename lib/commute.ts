import type { SupabaseClient } from '@supabase/supabase-js'

interface DistanceMatrixResponse {
  rows: Array<{
    elements: Array<{
      status: string
      duration: { text: string; value: number }
    }>
  }>
  destination_addresses: string[]
  status: string
}

async function fetchCommute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: 'transit' | 'walking'
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || apiKey.startsWith('placeholder')) return null

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=${mode}&key=${apiKey}`

  try {
    const res = await fetch(url)
    const data = await res.json() as DistanceMatrixResponse
    if (data.status !== 'OK') return null
    const element = data.rows[0]?.elements[0]
    if (!element || element.status !== 'OK') return null
    return Math.round(element.duration.value / 60)
  } catch {
    return null
  }
}

export interface CommuteTimes {
  commute_minutes_transit: number | null
  commute_minutes_walking: number | null
}

export async function calculateCommuteBothModes(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<CommuteTimes> {
  const [transit, walking] = await Promise.all([
    fetchCommute(originLat, originLng, destLat, destLng, 'transit'),
    fetchCommute(originLat, originLng, destLat, destLng, 'walking'),
  ])
  return { commute_minutes_transit: transit, commute_minutes_walking: walking }
}

// Keep single-mode export for backward compat with any callers
export async function calculateCommute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: string
): Promise<{ minutes: number } | null> {
  const minutes = await fetchCommute(originLat, originLng, destLat, destLng, mode === 'walking' ? 'walking' : 'transit')
  return minutes != null ? { minutes } : null
}

export async function recalculateAllCommutes(
  userId: string,
  workLat: number,
  workLng: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>
): Promise<number> {
  const { data: listings } = await supabase
    .from('listings')
    .select('id, lat, lng')
    .eq('user_id', userId)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (!listings?.length) return 0

  let updated = 0
  await Promise.all(
    listings.map(async (listing: { id: string; lat: number; lng: number }) => {
      const times = await calculateCommuteBothModes(workLat, workLng, listing.lat, listing.lng)
      if (times.commute_minutes_transit != null || times.commute_minutes_walking != null) {
        await supabase
          .from('listings')
          .update(times)
          .eq('id', listing.id)
          .eq('user_id', userId)
        updated++
      }
    })
  )

  return updated
}
