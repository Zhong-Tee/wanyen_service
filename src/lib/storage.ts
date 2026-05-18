import { supabase } from './supabase'

const BUCKET = 'product'

export async function uploadImage(file: File, folder: 'products' | 'jobs'): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split('.').pop()
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(filename, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) return { url: null, error: error.message }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return { url: data.publicUrl, error: null }
}

export async function deleteImage(url: string): Promise<void> {
  const marker = `/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return
  const path = url.slice(idx + marker.length)
  await supabase.storage.from(BUCKET).remove([path])
}
