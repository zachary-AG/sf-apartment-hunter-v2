import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// Accepts a multipart/form-data POST with a single "file" field.
// Uploads to Supabase Storage bucket "listing-images" and returns the public URL.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const fileName = (file as File).name ?? 'upload'
  const ext = fileName.split('.').pop() ?? 'jpg'
  // Scope uploads per user to avoid collisions
  const storagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const supabase = createServerSupabaseClient()
  const { error } = await supabase.storage
    .from('listing-images')
    .upload(storagePath, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })

  if (error) {
    console.error('[UploadImage] Supabase storage error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage
    .from('listing-images')
    .getPublicUrl(storagePath)

  return NextResponse.json({ url: urlData.publicUrl })
}
