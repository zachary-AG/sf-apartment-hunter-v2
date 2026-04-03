import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { assertListMember } from '@/lib/list-auth'
import type { Listing } from '@/types'
import { ListingDetailClient } from './ListingDetailClient'

interface Props {
  params: Promise<{ listId: string; listingId: string }>
}

export default async function ListingDetailPage({ params }: Props) {
  const { listId, listingId } = await params
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServerSupabaseClient()

  // Verify list membership
  try {
    await assertListMember(listId, userId, supabase)
  } catch {
    notFound()
  }

  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .eq('list_id', listId)
    .single()

  if (!listing) notFound()

  return <ListingDetailClient listing={listing as Listing} listId={listId} />
}
