interface CrimePoint {
  latitude: string
  longitude: string
}

export async function getSFCrimePoints(): Promise<Array<{ lat: number; lng: number }>> {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  // SoQL requires ISO 8601 floating timestamp format: 'YYYY-MM-DDTHH:MM:SS.SSS'
  const dateStr = twelveMonthsAgo.toISOString().replace('Z', '')

  const url = `https://data.sfgov.org/resource/wg3w-h783.json?$where=incident_datetime > '${dateStr}'&$limit=10000&$select=latitude,longitude`

  console.log('[SFCrime] Fetching from:', url)

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // No Next.js cache — always fresh for route handler context
    })
  } catch (err) {
    console.error('[SFCrime] Fetch error:', err)
    return []
  }

  if (!res.ok) {
    const body = await res.text()
    console.error(`[SFCrime] HTTP ${res.status}:`, body.slice(0, 500))
    return []
  }

  const data = await res.json() as CrimePoint[]
  console.log(`[SFCrime] Raw records returned: ${data.length}`)

  const points = data
    .filter(p => p.latitude && p.longitude)
    .map(p => ({
      lat: parseFloat(p.latitude),
      lng: parseFloat(p.longitude),
    }))
    .filter(p => !isNaN(p.lat) && !isNaN(p.lng))

  console.log(`[SFCrime] Valid lat/lng points: ${points.length}`)
  return points
}
