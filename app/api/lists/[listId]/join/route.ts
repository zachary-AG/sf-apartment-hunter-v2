import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { calculateCommutesForNewMember } from '@/lib/commute'

interface Ctx { params: Promise<{ listId: string }> }

/** POST /api/lists/[listId]/join — accept an invite */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { listId } = await ctx.params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { invite_code?: string }
  if (!body.invite_code) {
    return NextResponse.json({ error: 'invite_code is required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Validate invite code matches the list
  const { data: list } = await supabase
    .from('lists')
    .select('id, invite_code')
    .eq('id', listId)
    .single()

  if (!list || list.invite_code !== body.invite_code) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('list_members')
    .select('id')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ already_member: true })
  }

  // Get display name and work location from user_preferences in one query
  const { data: joiningPrefs } = await supabase
    .from('user_preferences')
    .select('display_name, work_lat, work_lng')
    .eq('user_id', userId)
    .maybeSingle()
  const displayName = joiningPrefs?.display_name || userId

  const { error } = await supabase
    .from('list_members')
    .insert({ list_id: listId, user_id: userId, display_name: displayName, role: 'member' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget: calculate commutes for all existing listings for this new member
  if (joiningPrefs?.work_lat && joiningPrefs?.work_lng) {
    calculateCommutesForNewMember(listId, userId, displayName, joiningPrefs.work_lat, joiningPrefs.work_lng, supabase)
      .catch(err => console.error('[Join] commute calculation failed:', err))
  }

  return NextResponse.json({ joined: true })
}
