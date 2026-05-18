import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage, deleteImage } from '../lib/storage'
import type { Product } from '../types'

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('products').select('*').order('name')
    if (data) setProducts(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const createProduct = async (name: string, description: string, imageFile?: File) => {
    let image_url: string | null = null
    if (imageFile) {
      const { url, error } = await uploadImage(imageFile, 'products')
      if (error) return { error }
      image_url = url
    }
    const { error } = await supabase.from('products').insert({
      name: name.trim(),
      description: description.trim() || null,
      image_url,
    })
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const updateProduct = async (id: string, name: string, description: string, imageFile?: File, oldImageUrl?: string | null) => {
    let image_url: string | null | undefined = undefined
    if (imageFile) {
      if (oldImageUrl) await deleteImage(oldImageUrl)
      const { url, error } = await uploadImage(imageFile, 'products')
      if (error) return { error }
      image_url = url
    }
    const updateData: Partial<Product> = { name: name.trim(), description: description.trim() || null }
    if (image_url !== undefined) updateData.image_url = image_url
    const { error } = await supabase.from('products').update(updateData).eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const deleteProduct = async (id: string, imageUrl?: string | null) => {
    if (imageUrl) await deleteImage(imageUrl)
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  return { products, loading, refresh: fetchAll, createProduct, updateProduct, deleteProduct }
}
