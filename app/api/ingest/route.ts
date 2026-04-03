import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { parseCraigslist, parseZillow } from '@/scrapers/parsers'
import { parseApartments } from '@/scrapers/parsers/apartments'
import { extractListingWithClaude, extractZillowData, draftInquiryEmail } from '@/lib/claude'
import { geocodeAddress } from '@/lib/geocode'
import { calculateCommutesForListing } from '@/lib/commute'
import { assertListMember } from '@/lib/list-auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { ParsedListing, ListingCommute } from '@/types'

type RequiredField = 'address' | 'beds' | 'baths' | 'price'

function missingRequiredFields(p: ParsedListing): RequiredField[] {
  const missing: RequiredField[] = []
  if (!p.address) missing.push('address')
  if (p.beds == null) missing.push('beds')
  if (p.baths == null) missing.push('baths')
  if (p.price == null) missing.push('price')
  return missing
}

function detectSource(url: string): string {
  if (url.includes('craigslist.org')) return 'craigslist'
  if (url.includes('zillow.com')) return 'zillow'
  if (url.includes('apartments.com')) return 'apartments'
  return 'unknown'
}

/** Extract the unit ID from a Zillow #udp-{id} fragment, e.g. "455922597" */
function extractUdpUnitId(url: string): string | null {
  const match = url.match(/#udp-(\d+)/)
  return match ? match[1] : null
}

/** Zillow internal unit detail API — returns JSON with price/beds/baths/sqft/availability */
interface ZillowRcfUnit {
  price?: number
  beds?: number
  baths?: number
  sqft?: number
  availableFrom?: string
  unitNumber?: string
  address?: string
  buildingName?: string
  description?: string
}

async function fetchZillowUnitApi(unitId: string, buildingUrl: string): Promise<ZillowRcfUnit | null> {
  const apiUrl = `https://www.zillow.com/rentals/api/rcf/v2/rcf/${unitId}`
  console.log(`[Ingest][Zillow] Trying unit API: ${apiUrl}`)
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': buildingUrl.split('#')[0],
      },
    })
    if (!res.ok) {
      console.warn(`[Ingest][Zillow] Unit API returned ${res.status}`)
      return null
    }
    const data = await res.json() as Record<string, unknown>
    console.log('[Ingest][Zillow] Unit API success')
    return {
      price: (data.price ?? data.listingPrice ?? data.rentPrice) as number | undefined,
      beds: (data.beds ?? data.bedrooms) as number | undefined,
      baths: (data.baths ?? data.bathrooms) as number | undefined,
      sqft: (data.sqft ?? data.livingArea) as number | undefined,
      availableFrom: (data.availableFrom ?? data.availableDate) as string | undefined,
      unitNumber: (data.unitNumber ?? data.unit) as string | undefined,
      address: (data.address ?? data.streetAddress) as string | undefined,
      buildingName: (data.buildingName ?? data.communityName) as string | undefined,
      description: data.description as string | undefined,
    }
  } catch (err) {
    console.warn('[Ingest][Zillow] Unit API fetch failed:', err)
    return null
  }
}

// Sources that always block direct server-side requests — skip straight to Bright Data
const JS_RENDERED_SOURCES = ['zillow.com', 'apartments.com']

function requiresProxy(url: string): boolean {
  return JS_RENDERED_SOURCES.some(host => url.includes(host))
}

async function fetchPage(url: string): Promise<string> {
  const needsProxy = requiresProxy(url)

  if (!needsProxy) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      })
      if (res.ok) return await res.text()
      console.warn(`[Ingest] Direct fetch returned ${res.status} — falling back to Bright Data`)
    } catch (err) {
      console.warn('[Ingest] Direct fetch failed:', err, '— falling back to Bright Data')
    }
  } else {
    console.log(`[Ingest] JS-rendered source detected — going straight to Bright Data`)
  }

  const brightDataKey = process.env.BRIGHT_DATA_API_KEY
  if (!brightDataKey) throw new Error('Bright Data API key not configured')

  console.log('[Ingest] Trying Bright Data Web Unlocker...')
  const res = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${brightDataKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ zone: 'mcp_unlocker', url, format: 'raw', country: 'us' }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error(`[Ingest] Bright Data returned ${res.status}: ${errText}`)
    throw new Error(`Bright Data returned an empty response. (Bot protection likely triggered)`)
  }

  const text = await res.text()
  if (!text.trim()) {
    console.error('[Ingest] Bright Data returned an empty body')
    throw new Error('Bright Data returned an empty response. (Bot protection likely triggered)')
  }

  console.log('[Ingest] Bright Data Web Unlocker success')
  return text
}

/** After inserting a listing, calculate commutes for all list members and return the commute array. */
async function applyCommutesForList(
  listingId: string,
  listingLat: number | null,
  listingLng: number | null,
  listId: string,
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<ListingCommute[]> {
  if (listingLat == null || listingLng == null) return []

  await calculateCommutesForListing(listingId, listingLat, listingLng, listId, supabase)

  const { data: commutes } = await supabase
    .from('listing_commutes')
    .select('listing_id, user_id, display_name, minutes_transit, minutes_walking')
    .eq('listing_id', listingId)

  return (commutes ?? []) as ListingCommute[]
}

async function getDisplayName(userId: string, supabase: ReturnType<typeof createServerSupabaseClient>): Promise<string> {
  const { data } = await supabase
    .from('user_preferences')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.display_name || userId
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { url?: string; list_id?: string }
  const { url, list_id: listId } = body
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }
  if (!listId || typeof listId !== 'string') {
    return NextResponse.json({ error: 'list_id is required' }, { status: 400 })
  }

  // Validate list membership
  const supabaseForAuth = createServerSupabaseClient()
  try {
    await assertListMember(listId, userId, supabaseForAuth)
  } catch {
    return NextResponse.json({ error: 'Not a member of this list' }, { status: 403 })
  }

  // Stream SSE progress events back to the client
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()

  function emit(step: string, payload?: Record<string, unknown>) {
    const data = JSON.stringify({ step, ...payload })
    writer.write(enc.encode(`data: ${data}\n\n`)).catch(() => {})
  }

  // Run the pipeline asynchronously so we can return the stream immediately
  ;(async () => {
    try {
      const supabaseEarly = createServerSupabaseClient()
      const addedByName = await getDisplayName(userId, supabaseEarly)

      emit('fetching')
      let html: string
      try {
        html = await fetchPage(url)
        console.log(`[Ingest] Fetched HTML: ${html.length} chars`)
      } catch {
        emit('done', { error: 'Failed to fetch listing page' })
        writer.close()
        return
      }

      emit('extracting')
      const source = detectSource(url)
      console.log(`[Ingest] Source detected: ${source}`)
      let parsed: ParsedListing = {}

      if (source === 'craigslist') {
        parsed = parseCraigslist(html)
      } else if (source === 'zillow') {
        const udpUnitId = extractUdpUnitId(url)

        if (udpUnitId) {
          console.log(`[Ingest][Zillow] UDP unit ID detected: ${udpUnitId}`)
          const unitData = await fetchZillowUnitApi(udpUnitId, url)

          if (unitData) {
            const udpParsed: ParsedListing = {
              title: [unitData.buildingName, unitData.unitNumber ? `Unit ${unitData.unitNumber}` : null].filter(Boolean).join(' — ') || unitData.address,
              address: unitData.address,
              price: unitData.price ?? null,
              beds: unitData.beds ?? null,
              baths: unitData.baths ?? null,
              sqft: unitData.sqft ?? null,
              description: unitData.description,
              available_date: unitData.availableFrom ?? null,
            }

            const missing = missingRequiredFields(udpParsed)
            if (missing.length > 0) {
              emit('done', { missingFields: missing, partialData: udpParsed, url, source })
              writer.close()
              return
            }

            emit('geocoding')
            const address = unitData.address || ''
            let lat: number | null = null
            let lng: number | null = null
            if (address) {
              const coords = await geocodeAddress(address)
              if (coords) { lat = coords.lat; lng = coords.lng }
            }

            emit('saving')
            const supabase = createServerSupabaseClient()
            const { data: listing, error } = await supabase
              .from('listings')
              .insert({
                user_id: userId, list_id: listId, added_by_name: addedByName,
                url, source,
                title: udpParsed.title || '', address,
                neighborhood: null, lat, lng,
                price: unitData.price ?? null, price_max: null,
                beds: unitData.beds ?? null, baths: unitData.baths ?? null,
                sqft: unitData.sqft ?? null, description: unitData.description ?? null,
                images: [], contact_email: null,
                available_date: unitData.availableFrom ?? null, amenities: null,
              })
              .select().single()

            if (error) {
              emit('done', { error: error.message })
            } else {
              const commutes = await applyCommutesForList(listing.id, lat, lng, listId, supabase)
              emit('done', { listing, commutes })
            }
            writer.close()
            return
          }

          console.log('[Ingest][Zillow] Unit API failed — falling back to building page scrape')
        }

        let zillowData: Awaited<ReturnType<typeof extractZillowData>> | null = null
        try {
          zillowData = await extractZillowData(html)
        } catch (err) {
          console.error('[Ingest][Zillow] Claude extraction failed:', err)
        }

        const cheerioResult = parseZillow(html)
        const images = [...new Set(cheerioResult.images?.length ? cheerioResult.images : [])].slice(0, 10)

        const address = zillowData?.address || ''
        let lat: number | null = null
        let lng: number | null = null
        if (address) {
          emit('geocoding')
          const coords = await geocodeAddress(address)
          if (coords) { lat = coords.lat; lng = coords.lng }
        }

        const units = zillowData?.units ?? []
        const firstUnit = units[0]
        const partialData: ParsedListing = {
          title: zillowData?.building_name || address,
          address,
          lat,
          lng,
          description: zillowData?.description || undefined,
          images,
          amenities: zillowData?.amenities ?? null,
          price: firstUnit?.price ?? null,
          beds: firstUnit?.beds ?? cheerioResult.beds ?? null,
          baths: firstUnit?.baths ?? cheerioResult.baths ?? null,
          sqft: firstUnit?.sqft ?? cheerioResult.sqft ?? null,
          available_date: firstUnit?.available_date ?? null,
        }
        const zillowMissing = missingRequiredFields(partialData)
        emit('done', { missingFields: zillowMissing, partialData, url, source })
        writer.close()
        return

      } else if (source === 'apartments') {
        const cheerioResult = parseApartments(html)
        const cheerioImages = cheerioResult.images ?? []
        console.log(`[Ingest][Apartments] HTML length: ${html.length} chars`)
        console.log(`[Ingest][Apartments] Cheerio found ${cheerioImages.length} images:`)
        cheerioImages.forEach((u, i) => console.log(`  [${i}] ${u}`))

        try {
          const claudeParsed = await extractListingWithClaude(html)
          console.log(`[Ingest][Apartments] Claude parsed:`, JSON.stringify(claudeParsed, null, 2))
          const claudeImages = claudeParsed.images ?? []
          const mergedImages = [...new Set([...cheerioImages, ...claudeImages])].slice(0, 20)
          parsed = { ...claudeParsed, images: mergedImages }
        } catch (err) {
          console.error('[Ingest][Apartments] Claude extraction failed:', err)
          parsed = { images: [...new Set([...cheerioImages])].slice(0, 20) }
        }
        console.log(`[Ingest][Apartments] Final parsed missing fields:`, missingRequiredFields(parsed))

        const totallyBlank = !parsed.address && !parsed.title && parsed.price == null && !(parsed.images?.length)
        if (totallyBlank) {
          emit('done', { error: 'Could not extract any listing data from this page. The site may have blocked the request — try again or check that the URL is a single listing page.' })
          writer.close()
          return
        }

        const apartmentsMissing = missingRequiredFields(parsed)
        emit('done', { missingFields: apartmentsMissing, partialData: parsed, url, source })
        writer.close()
        return
      }

      // Non-Zillow / non-Apartments: Claude fallback if required fields still missing.
      const addressBeforeClaude = parsed.address
      let earlyGeocodePromise: Promise<{ lat: number; lng: number } | null> | null = null

      if (source !== 'apartments' && missingRequiredFields(parsed).length > 0) {
        if (addressBeforeClaude) {
          earlyGeocodePromise = geocodeAddress(addressBeforeClaude)
        }
        try {
          const claudeParsed = await extractListingWithClaude(html)
          parsed = {
            ...claudeParsed,
            ...(parsed.title && { title: parsed.title }),
            ...(parsed.price != null && { price: parsed.price }),
            ...(parsed.beds != null && { beds: parsed.beds }),
            ...(parsed.baths != null && { baths: parsed.baths }),
            ...(parsed.sqft != null && { sqft: parsed.sqft }),
            ...(parsed.images?.length && { images: parsed.images }),
          }
        } catch (err) {
          console.error('[Ingest] Claude extraction failed:', err)
        }
      }

      if (parsed.images) {
        parsed.images = [...new Set(parsed.images)].slice(0, 10)
      }

      const nonZillowMissing = missingRequiredFields(parsed)
      if (nonZillowMissing.length > 0) {
        emit('done', { missingFields: nonZillowMissing, partialData: parsed, url, source })
        writer.close()
        return
      }

      emit('geocoding')
      let lat: number | null = null
      let lng: number | null = null
      if (parsed.address) {
        const coordsPromise = (earlyGeocodePromise && parsed.address === addressBeforeClaude)
          ? earlyGeocodePromise
          : geocodeAddress(parsed.address)
        const coords = await coordsPromise
        if (coords) { lat = coords.lat; lng = coords.lng }
      }

      emit('saving')
      const supabase = createServerSupabaseClient()
      const { data: listing, error } = await supabase
        .from('listings')
        .insert({
          user_id: userId, list_id: listId, added_by_name: addedByName,
          url, source,
          title: parsed.title || '', address: parsed.address || '',
          neighborhood: parsed.neighborhood || null, lat, lng,
          price: parsed.price || null, price_max: null,
          beds: parsed.beds ?? null, baths: parsed.baths ?? null,
          sqft: parsed.sqft || null, description: parsed.description || null,
          images: parsed.images || [], contact_email: parsed.contact_email || null,
          available_date: parsed.available_date || null, amenities: parsed.amenities ?? null,
        })
        .select().single()

      if (error) {
        emit('done', { error: error.message })
        writer.close()
        return
      }

      const commutes = await applyCommutesForList(listing.id, listing.lat, listing.lng, listId, supabase)

      if (!listing.price) {
        try {
          const emailDraft = await draftInquiryEmail(listing)
          emit('done', { listing, commutes, emailDraft })
        } catch {
          emit('done', { listing, commutes })
        }
      } else {
        emit('done', { listing, commutes })
      }
      writer.close()
    } catch (err) {
      emit('done', { error: err instanceof Error ? err.message : 'Unexpected error' })
      writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
