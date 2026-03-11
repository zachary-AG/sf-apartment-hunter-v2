import type { Listing } from '@/types'

// Client-side wrapper — calls API route to draft inquiry email
export async function draftInquiryEmailClient(
  listing: Partial<Listing>
): Promise<{ subject: string; body: string }> {
  const res = await fetch('/api/listings/draft-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing_id: listing.id }),
  })
  if (!res.ok) {
    return {
      subject: `Inquiry about ${listing.address || 'your listing'}`,
      body: `Hi,\n\nI'm interested in your apartment listing at ${listing.address || 'the address listed'}. Could you please let me know the monthly rent and availability?\n\nThank you!`,
    }
  }
  return res.json() as Promise<{ subject: string; body: string }>
}
