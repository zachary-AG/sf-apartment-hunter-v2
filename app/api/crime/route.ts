import { NextResponse } from 'next/server'
import { getSFCrimePoints } from '@/lib/sfcrime'

// Don't cache this route — data is fetched fresh and logged server-side
export const dynamic = 'force-dynamic'

export async function GET() {
  console.log('[/api/crime] GET called')
  const points = await getSFCrimePoints()
  console.log(`[/api/crime] Returning ${points.length} points`)
  return NextResponse.json({ points })
}
