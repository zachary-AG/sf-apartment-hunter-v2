import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { assertListMember } from '@/lib/list-auth'

interface Ctx { params: Promise<{ listId: string }> }

/** GET /api/lists/[listId]/members — members with display names + work locations */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { listId } = await ctx.params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  try {
    await assertListMember(listId, userId, supabase)
  } catch {
    return NextResponse.json({ error: 'Not a member of this list' }, { status: 403 })
  }

  const { data: members } = await supabase
    .from('list_members')
    .select('*')
    .eq('list_id', listId)
    .order('joined_at')

  if (!members?.length) {
    return NextResponse.json({ members: [] })
  }

  // Enrich with work locations from user_preferences
  const userIds = members.map(m => m.user_id)
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('user_id, work_lat, work_lng')
    .in('user_id', userIds)

  const prefsMap = new Map(prefs?.map(p => [p.user_id, p]) ?? [])

  const enriched = members.map(m => {
    const pref = prefsMap.get(m.user_id)
    return {
      ...m,
      work_lat: pref?.work_lat ?? null,
      work_lng: pref?.work_lng ?? null,
    }
  })

  return NextResponse.json({ members: enriched })
}
