import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { ListPickerClient } from './ListPickerClient'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServerSupabaseClient()

  // Get all lists the user belongs to
  const { data: memberships } = await supabase
    .from('list_members')
    .select('list_id, role')
    .eq('user_id', userId)

  // If no lists, auto-create a default one
  if (!memberships?.length) {
    const { data: prefsForName } = await supabase
      .from('user_preferences')
      .select('display_name')
      .eq('user_id', userId)
      .maybeSingle()
    const displayName = prefsForName?.display_name || userId

    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let inviteCode = ''
    for (let i = 0; i < 12; i++) inviteCode += chars[Math.floor(Math.random() * chars.length)]

    const { data: newList } = await supabase
      .from('lists')
      .insert({ name: 'My Listings', created_by: userId, invite_code: inviteCode })
      .select()
      .single()

    if (newList) {
      await supabase
        .from('list_members')
        .insert({ list_id: newList.id, user_id: userId, display_name: displayName, role: 'owner' })

      redirect(`/dashboard/${newList.id}`)
    }
  }

  // Show picker for all cases (including single list)
  const listIds = (memberships ?? []).map(m => m.list_id)
  const { data: lists } = await supabase
    .from('lists')
    .select('*')
    .in('id', listIds)
    .order('created_at', { ascending: false })

  // Get listing counts per list
  const { data: countRows } = await supabase
    .from('listings')
    .select('list_id')
    .in('list_id', listIds)

  const listingCounts: Record<string, number> = {}
  for (const row of countRows ?? []) {
    listingCounts[row.list_id] = (listingCounts[row.list_id] ?? 0) + 1
  }

  // Get member counts per list
  const { data: memberRows } = await supabase
    .from('list_members')
    .select('list_id')
    .in('list_id', listIds)

  const memberCounts: Record<string, number> = {}
  for (const row of memberRows ?? []) {
    memberCounts[row.list_id] = (memberCounts[row.list_id] ?? 0) + 1
  }

  const roleMap = new Map((memberships ?? []).map(m => [m.list_id, m.role]))

  const enriched = (lists ?? []).map(list => ({
    id: list.id as string,
    name: list.name as string,
    role: (roleMap.get(list.id) ?? 'member') as string,
    listing_count: listingCounts[list.id] ?? 0,
    member_count: memberCounts[list.id] ?? 0,
  }))

  return <ListPickerClient lists={enriched} />
}
