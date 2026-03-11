import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { recalculateAllCommutes } from '@/lib/commute'
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

  const updated = await recalculateAllCommutes(userId, prefs.work_lat, prefs.work_lng, supabase)

  return NextResponse.json({ updated })
}
