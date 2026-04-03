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
  minutes_transit: number | null
  minutes_walking: number | null
}

/** Calculate transit + walking commute between two points. */
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
  return { minutes_transit: transit, minutes_walking: walking }
}

/** Calculate and upsert a single listing_commutes row for one user. */
export async function calculateAndStoreCommute(
  listingId: string,
  listingLat: number,
  listingLng: number,
  userId: string,
  displayName: string,
  workLat: number,
  workLng: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>
): Promise<CommuteTimes> {
  const times = await calculateCommuteBothModes(workLat, workLng, listingLat, listingLng)

  await supabase
    .from('listing_commutes')
    .upsert({
      listing_id: listingId,
      user_id: userId,
      display_name: displayName,
      minutes_transit: times.minutes_transit,
      minutes_walking: times.minutes_walking,
    }, { onConflict: 'listing_id,user_id' })

  return times
}

/** Calculate commutes for ALL members of a list to one listing. */
export async function calculateCommutesForListing(
  listingId: string,
  listingLat: number,
  listingLng: number,
  listId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>
): Promise<void> {
  // Get all members of the list
  const { data: members } = await supabase
    .from('list_members')
    .select('user_id, display_name')
    .eq('list_id', listId)

  if (!members?.length) return

  // Get work addresses for all members
  const userIds = members.map(m => m.user_id)
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('user_id, work_lat, work_lng')
    .in('user_id', userIds)

  const prefsMap = new Map(prefs?.map(p => [p.user_id, p]) ?? [])

  await Promise.all(
    members.map(async (member) => {
      const pref = prefsMap.get(member.user_id)
      if (!pref?.work_lat || !pref?.work_lng) return
      await calculateAndStoreCommute(
        listingId, listingLat, listingLng,
        member.user_id, member.display_name,
        pref.work_lat, pref.work_lng,
        supabase
      )
    })
  )
}

/** Recalculate commutes for one user across ALL lists they belong to. */
export async function recalculateUserCommutesAcrossLists(
  userId: string,
  displayName: string,
  workLat: number,
  workLng: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>
): Promise<number> {
  // Get all lists this user belongs to
  const { data: memberships } = await supabase
    .from('list_members')
    .select('list_id')
    .eq('user_id', userId)

  if (!memberships?.length) return 0

  const listIds = memberships.map(m => m.list_id)

  // Get all listings in those lists that have coordinates
  const { data: listings } = await supabase
    .from('listings')
    .select('id, lat, lng')
    .in('list_id', listIds)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (!listings?.length) return 0

  let updated = 0
  await Promise.all(
    listings.map(async (listing: { id: string; lat: number; lng: number }) => {
      const times = await calculateAndStoreCommute(
        listing.id, listing.lat, listing.lng,
        userId, displayName,
        workLat, workLng,
        supabase
      )
      if (times.minutes_transit != null || times.minutes_walking != null) {
        updated++
      }
    })
  )

  return updated
}

/** Calculate commutes for a new member joining a list (all existing listings). */
export async function calculateCommutesForNewMember(
  listId: string,
  userId: string,
  displayName: string,
  workLat: number,
  workLng: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>
): Promise<void> {
  const { data: listings } = await supabase
    .from('listings')
    .select('id, lat, lng')
    .eq('list_id', listId)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (!listings?.length) return

  await Promise.all(
    listings.map(async (listing: { id: string; lat: number; lng: number }) => {
      await calculateAndStoreCommute(
        listing.id, listing.lat, listing.lng,
        userId, displayName,
        workLat, workLng,
        supabase
      )
    })
  )
}
