import * as cheerio from 'cheerio'
import type { ParsedListing } from '@/types'

export function parseApartments(html: string): ParsedListing {
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

  const images: string[] = []

  // apartments.com is JS-rendered — real photo URLs live in embedded JSON blobs, not <img src>
  // Pull all https URLs that look like CDN photo paths from inline script content
  const photoUrlPattern = /https:\/\/[^"'\s\\]+(?:apartments\.com|apartmenthosting\.com)[^"'\s\\]*(?:\.(?:jpg|jpeg|png|webp)|\/image\.jpg)/gi
  $('script').each((_, el) => {
    const content = $(el).html() || ''
    const matches = content.match(photoUrlPattern)
    if (matches) {
      for (const url of matches) {
        // Skip floor plan images (/104/ is the reliable apartments.com floor plan CDN path), icons, logos, etc.
        if (/\/104\/|floorplan|floor-plan|floor_plan|\/fp\/|flr-plan|thumb|icon|logo|avatar|sprite|badge|map|street/i.test(url)) continue
        images.push(url)
      }
    }
  })

  // Also check data-src on img tags (lazy-loaded real URLs)
  if (images.length === 0) {
    $('img[data-src]').each((_, el) => {
      const src = $(el).attr('data-src') || ''
      if (src.startsWith('http') && !src.startsWith('data:')) images.push(src)
    })
  }

  return {
    title,
    address,
    price,
    beds: bedsMatch ? parseFloat(bedsMatch[1]) : null,
    baths: bathsMatch ? parseFloat(bathsMatch[1]) : null,
    sqft: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, ''), 10) : null,
    description,
    images: [...new Set(images)].slice(0, 10),
  }
}
