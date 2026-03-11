import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const input = req.nextUrl.searchParams.get('input')
  if (!input?.trim()) return NextResponse.json({ suggestions: [] })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 500 })

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
    },
    body: JSON.stringify({
      input,
      includedPrimaryTypes: ['street_address', 'premise'],
      includedRegionCodes: ['us'],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('Places autocomplete error:', text)
    return NextResponse.json({ error: 'Places API error' }, { status: 502 })
  }

  const data = await res.json() as {
    suggestions?: Array<{
      placePrediction?: {
        text?: { text?: string }
        placeId?: string
      }
    }>
  }

  const suggestions = (data.suggestions ?? [])
    .map(s => ({
      description: s.placePrediction?.text?.text ?? '',
      placeId: s.placePrediction?.placeId ?? '',
    }))
    .filter(s => s.description && s.placeId)

  return NextResponse.json({ suggestions })
}
