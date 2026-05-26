import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fetchServiceRows, countZeroDayBranches } from '../lib/serviceReport'
import { thaiDateYmd, thaiDayEndIso, thaiDayStartIso } from '../lib/thaiDate'

export interface BadgeCounts {
  job: number
  delivery: number
  deliveryPendingToday: number
  deliveryShipped: number
  service: number
}

export function useBadgeCounts() {
  const [counts, setCounts] = useState<BadgeCounts>({
    job: 0,
    delivery: 0,
    deliveryPendingToday: 0,
    deliveryShipped: 0,
    service: 0,
  })

  const refresh = useCallback(async () => {
    const today = thaiDateYmd()
    const [jobRes, pendingTodayRes, shippedRes, serviceResult] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('deliveries').select('id', { count: 'exact', head: true })
        .eq('status', 'ต้องจัดส่ง')
        .gte('created_at', thaiDayStartIso(today))
        .lte('created_at', thaiDayEndIso(today)),
      supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('status', 'จัดส่งแล้ว'),
      fetchServiceRows().catch(() => [] as Awaited<ReturnType<typeof fetchServiceRows>>),
    ])
    const pendingToday = pendingTodayRes.count ?? 0
    const shipped = shippedRes.count ?? 0
    setCounts({
      job: jobRes.count ?? 0,
      delivery: pendingToday + shipped,
      deliveryPendingToday: pendingToday,
      deliveryShipped: shipped,
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
