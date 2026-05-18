import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { CodeCategory } from '../types'

export function useCategories() {
  const [categories, setCategories] = useState<CodeCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('code_categories')
      .select('*')
      .order('created_at', { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      setCategories(
        (data ?? []).map((row) => ({
          ...row,
          template: row.template ?? null,
        }))
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const createCategory = async (name: string): Promise<{ error: string | null }> => {
    const trimmed = name.trim().toUpperCase()
    if (!trimmed) return { error: 'กรุณากรอกชื่อประเภทโค้ด' }

    const { error: err } = await supabase
      .from('code_categories')
      .insert({ name: trimmed })

    if (err) {
      if (err.code === '23505') return { error: `ประเภทโค้ด "${trimmed}" มีอยู่แล้ว` }
      return { error: err.message }
    }

    await fetchCategories()
    return { error: null }
  }

  const updateCategoryTemplate = async (
    id: string,
    template: string | null
  ): Promise<{ error: string | null }> => {
    const { error: err } = await supabase
      .from('code_categories')
      .update({ template })
      .eq('id', id)

    if (err) return { error: err.message }

    await fetchCategories()
    return { error: null }
  }

  const updateCategoryName = async (id: string, name: string): Promise<{ error: string | null }> => {
    const trimmed = name.trim().toUpperCase()
    if (!trimmed) return { error: 'กรุณากรอกชื่อ' }
    const { error: err } = await supabase.from('code_categories').update({ name: trimmed }).eq('id', id)
    if (err) {
      if (err.code === '23505') return { error: `"${trimmed}" มีอยู่แล้ว` }
      return { error: err.message }
    }
    await fetchCategories()
    return { error: null }
  }

  const deleteCategory = async (id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase
      .from('code_categories')
      .delete()
      .eq('id', id)

    if (err) return { error: err.message }

    await fetchCategories()
    return { error: null }
  }

  return {
    categories,
    loading,
    error,
    refetch: fetchCategories,
    createCategory,
    updateCategoryName,
    updateCategoryTemplate,
    deleteCategory,
  }
}
