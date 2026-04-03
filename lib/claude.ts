import Anthropic from '@anthropic-ai/sdk'
import type { ParsedListing, Listing, ZillowUnit, Amenities } from '@/types'

const client = new Anthropic()

export async function extractListingWithClaude(html: string): Promise<ParsedListing> {
  // For JS-rendered pages (e.g. apartments.com), visible text after stripping scripts is empty.
  // Extract content from inline script tags instead, which contain the embedded JSON data.
  const scriptContents: string[] = []
  const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi
  let scriptMatch
  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    const content = scriptMatch[1].trim()
    // Only keep scripts that look like they contain listing data (JSON-like, has property keywords)
    if (content.length > 200 && /address|price|bedroom|bathroom|sqft|amenity/i.test(content)) {
      scriptContents.push(content.slice(0, 3000))
    }
  }

  let cleaned: string
  if (scriptContents.length > 0) {
    // Use script data — strip HTML tags from any remaining markup then join
    cleaned = scriptContents.join('\n').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)
    console.log(`[Claude][Extract] Using ${scriptContents.length} script blocks, cleaned length: ${cleaned.length}`)
    console.log(`[Claude][Extract] First 500 chars sent to Claude: ${cleaned.slice(0, 500)}`)
  } else {
    console.log(`[Claude][Extract] No matching scripts found, using stripped visible HTML`)
    // Fallback: strip scripts/styles and use visible text (works for static pages like Craigslist)
    cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Extract apartment listing details from this text and return ONLY valid JSON with these fields (use null for missing values):
{
  "title": string,
  "address": string,
  "price": number | null,
  "beds": number | null,
  "baths": number | null,
  "sqft": number | null,
  "description": string,
  "images": string[],
  "contact_email": string | null,
  "available_date": string | null,
  "neighborhood": string | null,
  "amenities": {
    "in_unit_laundry": boolean | null,
    "dishwasher": boolean | null,
    "parking": boolean | null,
    "gym": boolean | null,
    "doorman": boolean | null,
    "pet_friendly": boolean | null,
    "ac": boolean | null,
    "balcony": boolean | null,
    "hardwood_floors": boolean | null,
    "storage": boolean | null
  }
}

For amenities: return true if explicitly mentioned as present, false if explicitly mentioned as absent, null if not mentioned at all.

Return ONLY raw, valid JSON. Do not include markdown formatting, backticks, conversational text, or any other characters outside the JSON object.

Text:
${cleaned}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  console.log(`[Claude][Extract] Raw response (first 300 chars): ${text.slice(0, 300)}`)
  // Strip markdown code fences if present (Claude sometimes wraps JSON in ```json ... ```)
  const stripped = text.replace(/^```(?:json)?\s*/gi, '').replace(/\s*```\s*$/g, '').trim()
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.log(`[Claude][Extract] No JSON found in response`)
    return {}
  }

  try {
    return JSON.parse(jsonMatch[0]) as ParsedListing
  } catch {
    console.log(`[Claude][Extract] JSON parse failed`)
    return {}
  }
}

export interface ZillowExtracted {
  building_name: string | null
  address: string | null
  description: string | null
  units: ZillowUnit[]
  amenities: Amenities | null
}

export async function extractZillowData(html: string): Promise<ZillowExtracted> {
  const empty: ZillowExtracted = { building_name: null, address: null, description: null, units: [], amenities: null }

  // Extract <title> tag — Zillow titles typically contain the address
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const titleText = titleMatch ? titleMatch[1].trim() : ''
  console.log(`[Claude][Zillow] Page title: "${titleText}"`)

  // Strip script/style tags and extract visible text
  const visibleText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)

  const content = `Page title: ${titleText}\n\nPage text:\n${visibleText}`
  console.log(`[Claude][Zillow] Sending ${content.length} chars to Claude for extraction`)

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Extract the following from this Zillow page content and return ONLY valid JSON with no extra text:

{
  "building_name": string | null,  // Marketing/brand name (e.g. "Quincy", "The Avery"). null for single-family homes.
  "address": string | null,        // Full street address ONLY: "123 Main St, San Francisco, CA 94103". Never the building name. Often in the page title.
  "description": string | null,    // Property description text, 1-3 sentences max.
  "units": [                       // Array of available units from "Available Units", "Floor Plans", or "Pricing" sections.
    {
      "unit_name": string,         // Unit number or floor plan name (e.g. "Unit 4B", "Plan A", "2BR/1BA")
      "beds": number | null,
      "baths": number | null,
      "sqft": number | null,
      "price": number | null,      // Monthly rent in dollars, no symbols
      "available_date": string | null  // ISO date string or null
    }
  ],
  "amenities": {
    "in_unit_laundry": boolean | null,
    "dishwasher": boolean | null,
    "parking": boolean | null,
    "gym": boolean | null,
    "doorman": boolean | null,
    "pet_friendly": boolean | null,
    "ac": boolean | null,
    "balcony": boolean | null,
    "hardwood_floors": boolean | null,
    "storage": boolean | null
  }
}

Rules:
- "address" must be a real street address. Never use building name as address.
- Extract ALL individually listed units/floor plans you can find.
- If only a price range is shown with no individual units, create one entry with unit_name "Available unit", beds/baths from the listing header, and price as the minimum of the range.
- If no units section exists at all, create one entry using the main listing's beds/baths/price/sqft.
- For amenities: true if explicitly mentioned as present, false if explicitly mentioned as absent, null if not mentioned.

Return ONLY raw, valid JSON. Do not include markdown formatting, backticks, conversational text, or any other characters outside the JSON object.

${content}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  console.log(`[Claude][Zillow] Raw response: ${text.slice(0, 400)}`)

  const stripped2 = text.replace(/^```(?:json)?\s*/gi, '').replace(/\s*```\s*$/g, '').trim()
  const jsonMatch = stripped2.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return empty

  try {
    const result = JSON.parse(jsonMatch[0]) as ZillowExtracted
    return {
      building_name: result.building_name || null,
      address: result.address || null,
      description: result.description || null,
      units: Array.isArray(result.units) ? result.units : [],
      amenities: result.amenities || null,
    }
  } catch {
    return empty
  }
}

export async function draftInquiryEmail(
  listing: Partial<Listing>
): Promise<{ subject: string; body: string }> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Draft a friendly, concise inquiry email for this apartment listing. Ask about the monthly price and availability. Return ONLY valid JSON with "subject" and "body" fields.

Listing details:
- Title: ${listing.title || 'Apartment listing'}
- Address: ${listing.address || 'Unknown address'}
- Beds: ${listing.beds ?? 'Unknown'}
- Baths: ${listing.baths ?? 'Unknown'}
- URL: ${listing.url || ''}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      subject: `Inquiry about ${listing.address || 'your listing'}`,
      body: `Hi,\n\nI'm interested in your apartment listing at ${listing.address || 'the address listed'}. Could you please let me know the monthly rent and availability?\n\nThank you!`,
    }
  }

  try {
    return JSON.parse(jsonMatch[0]) as { subject: string; body: string }
  } catch {
    return {
      subject: `Inquiry about ${listing.address || 'your listing'}`,
      body: `Hi,\n\nI'm interested in your apartment listing at ${listing.address || 'the address listed'}. Could you please let me know the monthly rent and availability?\n\nThank you!`,
    }
  }
}
