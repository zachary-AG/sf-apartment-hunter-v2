import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Listing, ListMember, ListingCommute } from '@/types'
import { DashboardClient } from './DashboardClient'

interface Props {
  params: Promise<{ listId: string }>
}

export default async function ListDashboardPage({ params }: Props) {
  const { listId } = await params
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServerSupabaseClient()

  // Verify membership
  const { data: membership } = await supabase
    .from('list_members')
    .select('id')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) return null

  const [{ data: list }, { data: listings }, { data: members }, { data: prefs }] = await Promise.all([
    supabase.from('lists').select('*').eq('id', listId).single(),
    supabase.from('listings').select('*').eq('list_id', listId).order('created_at', { ascending: false }),
    supabase.from('list_members').select('*').eq('list_id', listId).order('joined_at'),
    supabase.from('user_preferences').select('user_id, work_lat, work_lng').in(
      'user_id',
      // We need to get member user_ids — fetch separately since we can't nest subqueries easily
      []
    ),
  ])

  // Re-fetch prefs with actual member user_ids
  const memberUserIds = (members ?? []).map((m: ListMember) => m.user_id)
  const { data: memberPrefs } = await supabase
    .from('user_preferences')
    .select('user_id, work_lat, work_lng')
    .in('user_id', memberUserIds)

  // Get all commutes for listings in this list
  const listingIds = ((listings ?? []) as Listing[]).map(l => l.id)
  let commutes: ListingCommute[] = []
  if (listingIds.length > 0) {
    const { data: commuteData } = await supabase
      .from('listing_commutes')
      .select('listing_id, user_id, display_name, minutes_transit, minutes_walking')
      .in('listing_id', listingIds)
    commutes = (commuteData ?? []) as ListingCommute[]
  }

  // Build commutes map keyed by listing_id
  const commutesMap: Record<string, ListingCommute[]> = {}
  for (const c of commutes) {
    if (!commutesMap[c.listing_id]) commutesMap[c.listing_id] = []
    commutesMap[c.listing_id].push(c)
  }

  // Build work locations from members + prefs
  const prefsMap = new Map((memberPrefs ?? []).map((p: { user_id: string; work_lat: number | null; work_lng: number | null }) => [p.user_id, p]))
  const COLORS = ['#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4']
  const workLocations = (members ?? [])
    .map((m: ListMember, i: number) => {
      const pref = prefsMap.get(m.user_id)
      if (!pref?.work_lat || !pref?.work_lng) return null
      return {
        lat: pref.work_lat as number,
        lng: pref.work_lng as number,
        displayName: m.display_name,
        color: COLORS[i % COLORS.length],
      }
    })
    .filter(Boolean) as { lat: number; lng: number; displayName: string; color: string }[]

  return (
    <DashboardClient
      listId={listId}
      listName={list?.name ?? 'List'}
      inviteCode={list?.invite_code ?? ''}
      initialListings={(listings as Listing[]) ?? []}
      members={(members as ListMember[]) ?? []}
      commutes={commutesMap}
      workLocations={workLocations}
      currentUserId={userId}
    />
  )
}
