import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const placeId = req.nextUrl.searchParams.get('placeId')
  if (!placeId?.trim()) return NextResponse.json({ error: 'Missing placeId' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 500 })

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('Places details error:', text)
    return NextResponse.json({ error: 'Places API error' }, { status: 502 })
  }

  const data = await res.json() as {
    formattedAddress?: string
    displayName?: { text?: string }
    location?: { latitude?: number; longitude?: number }
  }

  return NextResponse.json({
    address: data.formattedAddress ?? data.displayName?.text ?? '',
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
  })
}
