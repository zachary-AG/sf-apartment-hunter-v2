import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { draftInquiryEmail } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listing_id } = await req.json() as { listing_id?: string }
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 })

  const supabase = createServerSupabaseClient()
  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listing_id)
    .eq('user_id', userId)
    .single()

  if (!listing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const draft = await draftInquiryEmail(listing)
  return NextResponse.json(draft)
}
