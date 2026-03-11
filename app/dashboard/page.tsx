import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Listing } from '@/types'
import { DashboardClient } from './DashboardClient'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServerSupabaseClient()
  const [{ data: listings }, { data: prefs }] = await Promise.all([
    supabase.from('listings').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('user_preferences').select('work_lat, work_lng').eq('user_id', userId).maybeSingle(),
  ])

  const workLocation =
    prefs?.work_lat != null && prefs?.work_lng != null
      ? { lat: prefs.work_lat as number, lng: prefs.work_lng as number }
      : null

  return (
    <DashboardClient
      initialListings={(listings as Listing[]) ?? []}
      workLocation={workLocation}
    />
  )
}
