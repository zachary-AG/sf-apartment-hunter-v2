import type { SupabaseClient } from '@supabase/supabase-js'

/** Throws if the user is not a member of the given list. */
export async function assertListMember(
  listId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>
): Promise<void> {
  const { data } = await supabase
    .from('list_members')
    .select('id')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) {
    throw new Error('Not a member of this list')
  }
}

/** Returns the list_id for a given listing, or throws if not found. */
export async function getListIdForListing(
  listingId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>
): Promise<string> {
  const { data } = await supabase
    .from('listings')
    .select('list_id')
    .eq('id', listingId)
    .single()

  if (!data) {
    throw new Error('Listing not found')
  }

  return data.list_id
}

/** Asserts that the user is a member of the list that contains the given listing. Returns list_id. */
export async function assertListMemberForListing(
  listingId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, 'public', any>
): Promise<string> {
  const listId = await getListIdForListing(listingId, supabase)
  await assertListMember(listId, userId, supabase)
  return listId
}
