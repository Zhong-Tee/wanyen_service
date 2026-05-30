import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchServiceRows, countZeroDayBranches } from '../lib/serviceReport'
import { thaiDateYmd, thaiDayEndIso, thaiDayStartIso } from '../lib/thaiDate'
import {
  countPrinterAlertBadge,
  fetchLatestPrinterRecords,
  type PrinterLatestRecord,
} from '../lib/printerAlerts'

export interface BadgeCounts {
  job: number
  delivery: number
  deliveryPendingToday: number
  deliveryShipped: number
  service: number
  printer: number
}

const PRINTER_ALERT_TICK_MS = 60_000

export function useBadgeCounts() {
  const [counts, setCounts] = useState<BadgeCounts>({
    job: 0,
    delivery: 0,
    deliveryPendingToday: 0,
    deliveryShipped: 0,
    service: 0,
    printer: 0,
  })
  const printerRecordsRef = useRef<PrinterLatestRecord[]>([])

  const refresh = useCallback(async () => {
    const today = thaiDateYmd()
    const [jobRes, pendingTodayRes, shippedRes, serviceResult, printerRecords] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('deliveries').select('id', { count: 'exact', head: true })
        .eq('status', 'ต้องจัดส่ง')
        .gte('created_at', thaiDayStartIso(today))
        .lte('created_at', thaiDayEndIso(today)),
      supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('status', 'จัดส่งแล้ว'),
      fetchServiceRows().catch(() => [] as Awaited<ReturnType<typeof fetchServiceRows>>),
      fetchLatestPrinterRecords().catch(() => [] as PrinterLatestRecord[]),
    ])
    const pendingToday = pendingTodayRes.count ?? 0
    const shipped = shippedRes.count ?? 0
    printerRecordsRef.current = printerRecords
    setCounts({
      job: jobRes.count ?? 0,
      delivery: pendingToday + shipped,
      deliveryPendingToday: pendingToday,
      deliveryShipped: shipped,
      service: countZeroDayBranches(serviceResult),
      printer: countPrinterAlertBadge(printerRecords),
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'printer_log' }, () => refresh())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [refresh])

  useEffect(() => {
    const tick = setInterval(() => {
      if (printerRecordsRef.current.length === 0) return
      const printer = countPrinterAlertBadge(printerRecordsRef.current)
      setCounts((prev) => (prev.printer === printer ? prev : { ...prev, printer }))
    }, PRINTER_ALERT_TICK_MS)

    return () => clearInterval(tick)
  }, [])

  return { counts, refresh }
}
