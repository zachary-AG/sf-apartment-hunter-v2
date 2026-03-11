import * as cheerio from 'cheerio'
import type { ParsedListing } from '@/types'

export function parseCraigslist(html: string): ParsedListing {
  const $ = cheerio.load(html)

  const title = $('#titletextonly').text().trim()
  const address = $('.mapaddress').text().trim()

  const priceText = $('.price').first().text().trim()
  const price = priceText ? parseInt(priceText.replace(/[$,]/g, ''), 10) || null : null

  const description = $('#postingbody').text().trim()

  const images: string[] = []
  // Prefer full-size images from thumb links; fall back to lazy-loaded src
  $('a.thumb').each((_, el) => {
    const href = $(el).attr('href')
    if (href) images.push(href)
  })
  if (images.length === 0) {
    $('.gallery img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src')
      if (src && !src.startsWith('data:') && src.startsWith('http')) images.push(src)
    })
  }

  // Extract beds/baths from housing info
  const housingText = $('.shared-line-bubble').text()
  const bedsMatch = housingText.match(/(\d+(?:\.\d+)?)\s*BR/)
  const bathsMatch = housingText.match(/(\d+(?:\.\d+)?)\s*Ba/)
  const sqftMatch = housingText.match(/(\d+)\s*ft²/)

  return {
    title,
    address,
    price,
    beds: bedsMatch ? parseFloat(bedsMatch[1]) : null,
    baths: bathsMatch ? parseFloat(bathsMatch[1]) : null,
    sqft: sqftMatch ? parseInt(sqftMatch[1], 10) : null,
    description,
    images: [...new Set(images)].slice(0, 10),
  }
}
