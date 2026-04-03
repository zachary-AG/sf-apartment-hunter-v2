import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { InviteClient } from './InviteClient'

interface Props {
  params: Promise<{ code: string }>
}

export default async function InvitePage({ params }: Props) {
  const { code } = await params
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServerSupabaseClient()

  // Look up the list by invite code
  const { data: list } = await supabase
    .from('lists')
    .select('id, name, invite_code')
    .eq('invite_code', code)
    .single()

  if (!list) notFound()

  // Check if user is already a member
  const { data: existing } = await supabase
    .from('list_members')
    .select('id')
    .eq('list_id', list.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    redirect(`/dashboard/${list.id}`)
  }

  // Get member count for display
  const { count } = await supabase
    .from('list_members')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', list.id)

  return (
    <InviteClient
      listId={list.id}
      listName={list.name}
      inviteCode={list.invite_code}
      memberCount={count ?? 0}
    />
  )
}
