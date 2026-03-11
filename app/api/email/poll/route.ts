import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getGmailClient } from '@/lib/gmail'
import { createServerSupabaseClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

async function extractPriceFromEmail(text: string): Promise<number | null> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [
      {
        role: 'user',
        content: `Extract the monthly rent price from this email reply. Return ONLY a JSON object like {"price": 3500} or {"price": null} if no price found.\n\n${text.slice(0, 3000)}`,
      },
    ],
  })
  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = responseText.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { price?: number | null }
    return parsed.price ?? null
  } catch {
    return null
  }
}

function decodeEmailBody(payload: {
  body?: { data?: string }
  parts?: Array<{ mimeType?: string; body?: { data?: string } }>
}): string {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
    }
  }
  return ''
}

export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  const { data: tokenRow } = await supabase
    .from('user_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
  }

  const { data: listings } = await supabase
    .from('listings')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'inquiry_sent')
    .not('inquiry_email_id', 'is', null)

  if (!listings || listings.length === 0) {
    return NextResponse.json({ repliesFound: 0, listingsUpdated: 0 })
  }

  const gmail = await getGmailClient(tokenRow.gmail_refresh_token)
  let repliesFound = 0
  let listingsUpdated = 0

  for (const listing of listings) {
    try {
      // Get the original message to find its threadId
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: listing.inquiry_email_id,
        format: 'metadata',
        metadataHeaders: ['threadId'],
      })
      const threadId = msg.data.threadId
      if (!threadId) continue

      // Get the thread
      const thread = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      })

      const messages = thread.data.messages || []
      if (messages.length <= 1) continue

      repliesFound++

      // Decode the latest reply (last message)
      const latestMessage = messages[messages.length - 1]
      const bodyText = decodeEmailBody(
        latestMessage.payload as Parameters<typeof decodeEmailBody>[0]
      )

      const price = await extractPriceFromEmail(bodyText)

      const updates: Record<string, unknown> = {
        price_reply_received_at: new Date().toISOString(),
      }
      if (price != null) {
        updates.price = price
        updates.price_confirmed = true
        updates.status = 'price_received'
      }

      await supabase.from('listings').update(updates).eq('id', listing.id)
      listingsUpdated++
    } catch {
      // skip this listing on error
    }
  }

  // Log poll
  await supabase.from('email_poll_log').insert({
    user_id: userId,
    replies_found: repliesFound,
    listings_updated: listingsUpdated,
  })

  return NextResponse.json({ repliesFound, listingsUpdated })
}
