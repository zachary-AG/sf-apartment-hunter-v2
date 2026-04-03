export type ListingStatus = 'saved' | 'inquiry_sent' | 'price_received' | 'liked' | 'passed'

export interface Amenities {
  in_unit_laundry: boolean | null
  dishwasher: boolean | null
  parking: boolean | null
  gym: boolean | null
  doorman: boolean | null
  pet_friendly: boolean | null
  ac: boolean | null
  balcony: boolean | null
  hardwood_floors: boolean | null
  storage: boolean | null
}

export interface Listing {
  id: string
  user_id: string
  list_id: string
  added_by_name: string | null
  url: string
  source: string
  title: string
  address: string
  neighborhood: string | null
  lat: number | null
  lng: number | null
  price: number | null
  price_max: number | null
  price_confirmed: boolean
  beds: number | null
  baths: number | null
  sqft: number | null
  description: string | null
  images: string[]
  contact_email: string | null
  status: ListingStatus
  inquiry_email_id: string | null
  inquiry_sent_at: string | null
  price_reply_received_at: string | null
  notes: string | null
  available_date: string | null
  amenities: Amenities | null
  created_at: string
  updated_at: string
}

export interface List {
  id: string
  name: string
  created_by: string
  invite_code: string
  created_at: string
  updated_at: string
}

export interface ListMember {
  id: string
  list_id: string
  user_id: string
  display_name: string
  role: 'owner' | 'member'
  joined_at: string
}

export interface ListingCommute {
  listing_id: string
  user_id: string
  display_name: string
  minutes_transit: number | null
  minutes_walking: number | null
}

export interface UserToken {
  id: string
  user_id: string
  gmail_refresh_token: string
  gmail_email: string
  created_at: string
}

export interface UserPreferences {
  id: string
  user_id: string
  display_name: string | null
  commute_address: string | null
  work_address: string | null
  work_lat: number | null
  work_lng: number | null
  commute_mode: string
  created_at: string
  updated_at: string
}

export interface ParsedListing {
  title?: string
  address?: string
  lat?: number | null
  lng?: number | null
  price?: number | null
  beds?: number | null
  baths?: number | null
  sqft?: number | null
  description?: string
  images?: string[]
  contact_email?: string | null
  available_date?: string | null
  neighborhood?: string | null
  amenities?: Amenities | null
}

export interface ZillowUnit {
  unit_name: string
  beds: number | null
  baths: number | null
  sqft: number | null
  price: number | null
  available_date: string | null
}
