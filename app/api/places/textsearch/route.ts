import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const query = req.nextUrl.searchParams.get('query')
  if (!query?.trim()) return NextResponse.json({ places: [] })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 500 })

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: {
        circle: {
          center: { latitude: 37.7749, longitude: -122.4194 },
          radius: 20000,
        },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('Places text search error:', text)
    return NextResponse.json({ error: 'Places API error' }, { status: 502 })
  }

  const data = await res.json() as {
    places?: Array<{
      id?: string
      displayName?: { text?: string }
      formattedAddress?: string
      location?: { latitude?: number; longitude?: number }
    }>
  }

  const places = (data.places ?? [])
    .filter(p => p.location?.latitude != null && p.location?.longitude != null)
    .map(p => ({
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      lat: p.location!.latitude!,
      lng: p.location!.longitude!,
    }))

  return NextResponse.json({ places })
}
