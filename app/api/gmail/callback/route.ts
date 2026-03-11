import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getTokensFromCode, getGmailClient } from '@/lib/gmail'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/settings?gmail=error', req.url))
  }

  try {
    const tokens = await getTokensFromCode(code)
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/settings?gmail=no_refresh_token', req.url))
    }

    // Get user email address
    const gmailClient = await getGmailClient(tokens.refresh_token)
    const profile = await gmailClient.users.getProfile({ userId: 'me' })
    const gmailEmail = profile.data.emailAddress || ''

    const supabase = createServerSupabaseClient()
    await supabase.from('user_tokens').upsert({
      user_id: userId,
      gmail_refresh_token: tokens.refresh_token,
      gmail_email: gmailEmail,
    })

    return NextResponse.redirect(new URL('/settings?gmail=connected', req.url))
  } catch {
    return NextResponse.redirect(new URL('/settings?gmail=error', req.url))
  }
}
