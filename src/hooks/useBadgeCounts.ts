import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface BadgeCounts {
  job: number
  delivery: number
}

export function useBadgeCounts() {
  const [counts, setCounts] = useState<BadgeCounts>({ job: 0, delivery: 0 })

  const refresh = useCallback(async () => {
    const [jobRes, delRes] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('deliveries').select('id', { count: 'exact', head: true }).in('status', ['ต้องจัดส่ง', 'จัดส่งแล้ว']),
    ])
    setCounts({ job: jobRes.count ?? 0, delivery: delRes.count ?? 0 })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { counts, refresh }
}
