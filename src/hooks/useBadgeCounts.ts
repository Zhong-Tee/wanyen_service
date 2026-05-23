import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fetchServiceRows, countZeroDayBranches } from '../lib/serviceReport'

export interface BadgeCounts {
  job: number
  delivery: number
  service: number
}

export function useBadgeCounts() {
  const [counts, setCounts] = useState<BadgeCounts>({ job: 0, delivery: 0, service: 0 })

  const refresh = useCallback(async () => {
    const [jobRes, delRes, serviceResult] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('deliveries').select('id', { count: 'exact', head: true }).in('status', ['ต้องจัดส่ง', 'จัดส่งแล้ว']),
      fetchServiceRows().catch(() => [] as Awaited<ReturnType<typeof fetchServiceRows>>),
    ])
    setCounts({
      job: jobRes.count ?? 0,
      delivery: delRes.count ?? 0,
      service: countZeroDayBranches(serviceResult),
    })
  }, [])

  useEffect(() => {
    refresh()

    const channel = supabase
      .channel('badge-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branch_stock' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_sales_report' }, () => refresh())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [refresh])

  return { counts, refresh }
}
