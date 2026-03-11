export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || apiKey.startsWith('placeholder')) {
    console.warn('[Geocode] No API key configured — skipping geocoding')
    return null
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
  console.log(`[Geocode] Geocoding address: "${address}"`)

  try {
    const res = await fetch(url)
    const data = await res.json() as {
      status: string
      error_message?: string
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>
    }

    if (data.status === 'OK' && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location
      console.log(`[Geocode] Success: ${lat}, ${lng}`)
      return { lat, lng }
    }

    console.warn(`[Geocode] Failed — status: ${data.status}${data.error_message ? `, message: ${data.error_message}` : ''}`)
  } catch (err) {
    console.error('[Geocode] Fetch error:', err)
  }

  return null
}
