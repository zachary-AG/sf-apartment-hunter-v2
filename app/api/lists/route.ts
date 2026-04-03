import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'

function generateInviteCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 12; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** GET /api/lists — all lists the current user belongs to */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const { data: memberships } = await supabase
    .from('list_members')
    .select('list_id, role')
    .eq('user_id', userId)

  if (!memberships?.length) {
    return NextResponse.json({ lists: [] })
  }

  const listIds = memberships.map(m => m.list_id)
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

  const roleMap = new Map(memberships.map(m => [m.list_id, m.role]))

  const enriched = (lists ?? []).map(list => ({
    ...list,
    role: roleMap.get(list.id) ?? 'member',
    listing_count: listingCounts[list.id] ?? 0,
    member_count: memberCounts[list.id] ?? 0,
  }))

  return NextResponse.json({ lists: enriched })
}

/** POST /api/lists — create a new list */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Get display name from user_preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()
  const displayName = prefs?.display_name || userId
  const { data: list, error } = await supabase
    .from('lists')
    .insert({ name, created_by: userId, invite_code: generateInviteCode() })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Add creator as owner
  await supabase
    .from('list_members')
    .insert({ list_id: list.id, user_id: userId, display_name: displayName, role: 'owner' })

  return NextResponse.json({ list })
}
