import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getGmailClient } from '@/lib/gmail'
import { createServerSupabaseClient } from '@/lib/supabase'

function buildRFC2822(from: string, to: string, subject: string, body: string): string {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n')
  return Buffer.from(message).toString('base64url')
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { listing_id?: string; subject?: string; body?: string }
  const { listing_id, subject, body: emailBody } = body

  if (!listing_id || !subject || !emailBody) {
    return NextResponse.json({ error: 'listing_id, subject, and body are required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Get Gmail token
  const { data: tokenRow } = await supabase
    .from('user_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ error: 'Gmail not connected. Please connect Gmail in Settings.' }, { status: 400 })
  }

  // Get listing
  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listing_id)
    .eq('user_id', userId)
    .single()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  if (!listing.contact_email) {
    return NextResponse.json({ error: 'No contact email for this listing' }, { status: 400 })
  }

  const gmail = await getGmailClient(tokenRow.gmail_refresh_token)

  const raw = buildRFC2822(
    tokenRow.gmail_email,
    listing.contact_email,
    subject,
    emailBody
  )

  const sent = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  })

  const messageId = sent.data.id

  // Update listing
  await supabase
    .from('listings')
    .update({
      inquiry_email_id: messageId,
      status: 'inquiry_sent',
      inquiry_sent_at: new Date().toISOString(),
    })
    .eq('id', listing_id)

  return NextResponse.json({ success: true, messageId })
}
