import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { BranchStock } from '../types'

export function useStockReport() {
  const [data, setData] = useState<BranchStock[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase
      .from('branch_stock')
      .select('*, product:products(*), branch:branches(*, store_group:store_groups(*))')
      .order('branch_id')
    if (rows) setData(rows as BranchStock[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  return { data, loading, refresh: fetchAll }
}
