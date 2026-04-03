import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { recalculateUserCommutesAcrossLists } from '@/lib/commute'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('work_lat, work_lng')
    .eq('user_id', userId)
    .single()

  if (!prefs?.work_lat || !prefs?.work_lng) {
    return NextResponse.json({ updated: 0 })
  }

  let displayName = userId
  try {
    const clerk = await clerkClient()
    const user = await clerk.users.getUser(userId)
    displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || userId
  } catch { /* fall back to userId */ }

  const updated = await recalculateUserCommutesAcrossLists(
    userId, displayName, prefs.work_lat, prefs.work_lng, supabase
  )

  return NextResponse.json({ updated })
}
