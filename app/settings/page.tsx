import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServerSupabaseClient()

  const [{ data: tokenRow }, { data: prefs }] = await Promise.all([
    supabase.from('user_tokens').select('gmail_email').eq('user_id', userId).maybeSingle(),
    supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
  ])

  return (
    <SettingsClient
      gmailEmail={tokenRow?.gmail_email ?? null}
      commuteAddress={prefs?.commute_address ?? null}
      workAddress={prefs?.work_address ?? null}
      workLat={prefs?.work_lat ?? null}
      workLng={prefs?.work_lng ?? null}
      commuteMode={prefs?.commute_mode ?? 'transit'}
    />
  )
}
