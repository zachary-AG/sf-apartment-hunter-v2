import * as cheerio from 'cheerio'
import type { ParsedListing } from '@/types'

export function parseZillow(html: string): ParsedListing {
  const $ = cheerio.load(html)

  // Try JSON-LD first
  let jsonLd: Record<string, unknown> | null = null
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}') as Record<string, unknown>
      if (data['@type'] === 'SingleFamilyResidence' || data['@type'] === 'Apartment' || data['name']) {
        jsonLd = data
      }
    } catch {
      // ignore parse errors
    }
  })

  const title = jsonLd
    ? String((jsonLd as Record<string, unknown>)['name'] || '')
    : $('h1').first().text().trim()

  const address = jsonLd
    ? formatJsonLdAddress((jsonLd as Record<string, unknown>)['address'] as Record<string, string> | undefined)
    : $('[data-test="property-address"]').text().trim() || $('h1').first().text().trim()

  const priceText = $('[data-test="property-status"]').text() ||
    $('.ds-price').text() ||
    $('[class*="price"]').first().text()
  const priceMatch = priceText.match(/\$?([\d,]+)/)
  const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) || null : null

  const bedBathText = $('[data-test="bed-bath-item"]').map((_, el) => $(el).text()).get().join(' ')
  const bedsMatch = bedBathText.match(/(\d+(?:\.\d+)?)\s*bd/)
  const bathsMatch = bedBathText.match(/(\d+(?:\.\d+)?)\s*ba/)
  const sqftMatch = bedBathText.match(/([\d,]+)\s*sqft/i)

  const description = $('[data-test="listing-description"]').text().trim() ||
    $('[class*="description"]').first().text().trim()

  const images: string[] = []
  // One URL per <picture> element — take the first source's first srcset entry
  $('picture').each((_, picture) => {
    // Skip pictures inside floorplan containers
    const parentHtml = $(picture).closest('[class*="floor"],[class*="Floor"],[data-testid*="floor"]').length
    if (parentHtml > 0) return

    const source = $(picture).find('source').first()
    const srcset = source.attr('srcset')
    if (srcset) {
      const url = srcset.split(',')[0].trim().split(' ')[0]
      if (url && !/floorplan|floor.plan|floor_plan/i.test(url)) { images.push(url); return }
    }
    // Fall back to the <img> inside the picture
    const src = $(picture).find('img').attr('src')
    if (src && src.startsWith('http') && !/floorplan|floor.plan|floor_plan/i.test(src)) images.push(src)
  })
  if (images.length === 0) {
    $('img[src*="zillow"]').each((_, el) => {
      const src = $(el).attr('src')
      if (src && !/floorplan|floor.plan|floor_plan/i.test(src)) images.push(src)
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

function formatJsonLdAddress(address: Record<string, string> | undefined): string {
  if (!address) return ''
  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
  ].filter(Boolean)
  return parts.join(', ')
}
