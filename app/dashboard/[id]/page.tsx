import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Listing } from '@/types'
import { ListingDetailClient } from './ListingDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) return null

  const supabase = createServerSupabaseClient()
  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!listing) notFound()

  return <ListingDetailClient listing={listing as Listing} />
}
