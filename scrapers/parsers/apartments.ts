import * as cheerio from 'cheerio'
import type { ParsedListing } from '@/types'

export interface ApartmentsParsed extends ParsedListing {
  /** Apartments.com internal property ID, used to fetch the full photo gallery */
  propertyId?: string
}

export function parseApartments(html: string): ApartmentsParsed {
  const $ = cheerio.load(html)

  const title = $('.property-title').first().text().trim() ||
    $('h1').first().text().trim()

  const address = $('.property-address').first().text().trim() ||
    $('[class*="address"]').first().text().trim()

  const priceText = $('.rent-price').first().text() ||
    $('[class*="rent"]').first().text() ||
    $('[class*="price"]').first().text()
  const priceMatch = priceText.match(/\$?([\d,]+)/)
  const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) || null : null

  const infoText = $('.property-info-col').text()
  const bedsMatch = infoText.match(/(\d+(?:\.\d+)?)\s*(?:Bed|BR|bed)/i)
  const bathsMatch = infoText.match(/(\d+(?:\.\d+)?)\s*(?:Bath|BA|bath)/i)
  const sqftMatch = infoText.match(/([\d,]+)\s*sq\s*ft/i)

  const description = $('[class*="description"]').first().text().trim()

  // Extract the internal property ID from the page.
  // It appears as a data attribute, a meta tag, or embedded in inline script JSON.
  let propertyId: string | undefined

  // data-listingid / data-propertyid attributes
  const dataEl = $('[data-listingid]').first() || $('[data-propertyid]').first()
  propertyId = dataEl.attr('data-listingid') || dataEl.attr('data-propertyid')

  // <meta name="propertyId" ...> or <meta property="og:..." content="...id...">
  if (!propertyId) {
    $('meta').each((_, el) => {
      const name = $(el).attr('name') || $(el).attr('property') || ''
      if (/propertyid|listingid/i.test(name)) {
        propertyId = $(el).attr('content') || undefined
      }
    })
  }

  // Inline scripts: look for "propertyId":"12345" or listingId:12345
  if (!propertyId) {
    const idMatch = html.match(/"(?:propertyId|listingId|PropertyId)"\s*:\s*"?(\d{6,})"?/)
    if (idMatch) propertyId = idMatch[1]
  }

  console.log(`[Apartments] Property ID: ${propertyId ?? 'not found'}`)

  const images: string[] = []
  const seenUrls = new Set<string>()
  const floorPlanUrls = new Set<string>()

  // Collect floor plan image URLs so they can be excluded
  $('[class*="floorPlan"] [data-background-image], .floorPlanButtonImage').each((_, el) => {
    const src = $(el).attr('data-background-image') || ''
    if (src) floorPlanUrls.add(src.split('?')[0])
  })

  function addImage(src: string) {
    if (!src.startsWith('http')) return
    const canonical = src.split('?')[0]
    if (seenUrls.has(canonical)) return
    if (floorPlanUrls.has(canonical)) return
    seenUrls.add(canonical)
    images.push(src)
  }

  // 1. DOM elements: .aspectRatioImage containers
  $('div.aspectRatioImage').each((_, el) => {
    const src = $(el).find('img').attr('src') || $(el).attr('data-background-image') || ''
    addImage(src)
  })

  // 2. Lazy-loaded <img> tags pointing to the apartments.com CDN
  $('img[src*="cdn.apartments.com"], img[data-src*="cdn.apartments.com"]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || ''
    addImage(src)
  })

  // 3. Inline script blobs — cast a wide net for image URLs
  const imageUrlPattern = /https:\/\/[^"'\s\\]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"'\s\\]*)?/gi
  $('script').each((_, el) => {
    const scriptContent = $(el).html() || ''
    const matches = scriptContent.match(imageUrlPattern)
    if (matches) {
      for (const m of matches) {
        addImage(m.replace(/[,;)\]}'\\]+$/, ''))
      }
    }
  })

  console.log(`[Apartments] Cheerio found ${images.length} images`)

  return {
    title,
    address,
    price,
    beds: bedsMatch ? parseFloat(bedsMatch[1]) : null,
    baths: bathsMatch ? parseFloat(bathsMatch[1]) : null,
    sqft: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, ''), 10) : null,
    description,
    images: images.slice(0, 20),
    propertyId,
  }
}

/**
 * Fetch the full photo gallery from the apartments.com internal API.
 * Returns image URLs or null if the API call fails / returns nothing useful.
 */
export async function fetchApartmentsGallery(propertySlug: string): Promise<string[] | null> {
  // Try known apartments.com internal endpoints in order
  const endpoints = [
    `https://www.apartments.com/services/property/${propertySlug}`,
    `https://www.apartments.com/services/property/${propertySlug}/photos`,
    `https://www.apartments.com/api/v2/property/${propertySlug}`,
  ]

  for (const url of endpoints) {
    console.log(`[Apartments][Gallery] Trying: ${url}`)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*',
          'Referer': `https://www.apartments.com/${propertySlug}/`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
      console.log(`[Apartments][Gallery] ${url} → ${res.status}`)
      if (!res.ok) continue

      const text = await res.text()
      console.log(`[Apartments][Gallery] Response (first 300): ${text.slice(0, 300)}`)

      let data: unknown
      try { data = JSON.parse(text) } catch { continue }

      const urls = extractImageUrlsFromJson(data)
      if (urls.length > 0) {
        console.log(`[Apartments][Gallery] Got ${urls.length} images from ${url}`)
        return urls
      }
    } catch (err) {
      console.warn(`[Apartments][Gallery] Fetch error for ${url}:`, err)
    }
  }

  console.warn('[Apartments][Gallery] All endpoints failed or returned no images')
  return null
}

function extractImageUrlsFromJson(data: unknown): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    const obj = node as Record<string, unknown>
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string' && /^https?:\/\/.+\.(?:jpg|jpeg|png|webp)/i.test(val)) {
        const canonical = val.split('?')[0]
        if (!seen.has(canonical)) { seen.add(canonical); urls.push(val) }
      } else if (key.toLowerCase().includes('url') || key.toLowerCase().includes('src') || key.toLowerCase().includes('photo') || key.toLowerCase().includes('image')) {
        walk(val)
      } else {
        walk(val)
      }
    }
  }

  walk(data)
  return urls
}
