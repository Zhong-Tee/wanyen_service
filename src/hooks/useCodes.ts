import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { buildMessage, DEFAULT_TEMPLATE } from '../lib/template'
import type { ImportResult, ReportItem, CodeCategory } from '../types'
import type { ExcelCodeEntry } from '../lib/excel'

export function useAvailableCount(categoryId: string | null) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchCount = useCallback(async () => {
    if (!categoryId) {
      setCount(null)
      return
    }
    setLoading(true)
    const { count: c, error } = await supabase
      .from('codes')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('status', 'available')

    if (!error) setCount(c ?? 0)
    setLoading(false)
  }, [categoryId])

  return { count, loading, refetch: fetchCount }
}

export function useCopyCode() {
  const [copying, setCopying] = useState(false)

  const copyCode = async (
    categoryId: string,
    quantity: number,
    template: string | null,
    showSuffix: boolean
  ): Promise<{ success: boolean; error?: string; actualCount?: number }> => {
    setCopying(true)

    try {
      const { data: codes, error: fetchError } = await supabase
        .from('codes')
        .select('id, code')
        .eq('category_id', categoryId)
        .eq('status', 'available')
        .limit(quantity)

      if (fetchError) throw new Error(fetchError.message)
      if (!codes || codes.length === 0) {
        return { success: false, error: 'ไม่มีโค้ดคงเหลือในประเภทนี้', actualCount: 0 }
      }
      if (codes.length < quantity) {
        return {
          success: false,
          error: `โค้ดคงเหลือไม่พอ มีเพียง ${codes.length} โค้ด`,
          actualCount: codes.length,
        }
      }

      const ids = codes.map((c) => c.id)
      const { error: updateError } = await supabase
        .from('codes')
        .update({ status: 'used', used_at: new Date().toISOString() })
        .in('id', ids)

      if (updateError) throw new Error(updateError.message)

      const codeList = codes.map((c) => c.code)
      const tmpl = template ?? DEFAULT_TEMPLATE
      const text = buildMessage(codeList, tmpl, showSuffix)

      await navigator.clipboard.writeText(text)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }
    } finally {
      setCopying(false)
    }
  }

  return { copying, copyCode }
}

export function useImportCodes() {
  const [importing, setImporting] = useState(false)

  const importCodes = async (
    categoryId: string,
    entries: ExcelCodeEntry[]
  ): Promise<ImportResult> => {
    setImporting(true)
    const result: ImportResult = { imported: 0, duplicate: 0, invalid: 0 }

    try {
      const rows = entries.map(({ code, status }) => ({ category_id: categoryId, code, status }))
      const { data, error } = await supabase
        .from('codes')
        .upsert(rows, { onConflict: 'category_id,code', ignoreDuplicates: true })
        .select('id')

      if (error) throw new Error(error.message)
      result.imported = data?.length ?? 0
      result.duplicate = entries.length - result.imported
    } finally {
      setImporting(false)
    }

    return result
  }

  return { importing, importCodes }
}

export function useReport(categories: CodeCategory[]) {
  const [items, setItems] = useState<ReportItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchReport = useCallback(async () => {
    if (categories.length === 0) {
      setItems([])
      return
    }
    setLoading(true)

    const stats = await Promise.all(
      categories.map(async (cat) => {
        const [totalRes, availRes] = await Promise.all([
          supabase
            .from('codes')
            .select('*', { count: 'exact', head: true })
            .eq('category_id', cat.id),
          supabase
            .from('codes')
            .select('*', { count: 'exact', head: true })
            .eq('category_id', cat.id)
            .eq('status', 'available'),
        ])
        const total = totalRes.count ?? 0
        const available = availRes.count ?? 0
        return { category: cat, total, available, used: total - available }
      })
    )

    setItems(stats)
    setLoading(false)
  }, [categories])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  return { items, loading, refetch: fetchReport }
}
