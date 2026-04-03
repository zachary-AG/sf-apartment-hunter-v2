import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { assertListMember } from '@/lib/list-auth'

interface Ctx { params: Promise<{ listId: string }> }

/** GET /api/lists/[listId] — list details + members */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { listId } = await ctx.params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  try {
    await assertListMember(listId, userId, supabase)
  } catch {
    return NextResponse.json({ error: 'Not a member of this list' }, { status: 403 })
  }

  const [{ data: list }, { data: members }] = await Promise.all([
    supabase.from('lists').select('*').eq('id', listId).single(),
    supabase.from('list_members').select('*').eq('list_id', listId).order('joined_at'),
  ])

  return NextResponse.json({ list, members })
}

/** PATCH /api/lists/[listId] — rename list (owner only) */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { listId } = await ctx.params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  // Check ownership
  const { data: membership } = await supabase
    .from('list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  if (membership.role !== 'owner') return NextResponse.json({ error: 'Only the owner can rename' }, { status: 403 })

  const body = await req.json() as { name?: string }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('lists')
    .update({ name })
    .eq('id', listId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ list: data })
}

/** DELETE /api/lists/[listId] — delete list (owner only) */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { listId } = await ctx.params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  const { data: membership } = await supabase
    .from('list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  if (membership.role !== 'owner') return NextResponse.json({ error: 'Only the owner can delete' }, { status: 403 })

  const { error } = await supabase
    .from('lists')
    .delete()
    .eq('id', listId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
