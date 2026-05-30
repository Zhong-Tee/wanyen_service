import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchServiceRows, countZeroDayBranches } from '../lib/serviceReport'
import { thaiDateYmd, thaiDayEndIso, thaiDayStartIso } from '../lib/thaiDate'
import {
  countPrinterAlertBadge,
  fetchLatestPrinterRecords,
  type PrinterLatestRecord,
} from '../lib/printerAlerts'
import { countSimExpiringWithin30Days, type SimExpiryBranch } from '../lib/simExpiry'

export interface BadgeCounts {
  job: number
  delivery: number
  deliveryPendingToday: number
  deliveryShipped: number
  service: number
  printer: number
  settings: number
}

const PRINTER_ALERT_TICK_MS = 60_000
const SIM_EXPIRY_TICK_MS = 60 * 60_000

export function useBadgeCounts() {
  const [counts, setCounts] = useState<BadgeCounts>({
    job: 0,
    delivery: 0,
    deliveryPendingToday: 0,
    deliveryShipped: 0,
    service: 0,
    printer: 0,
    settings: 0,
  })
  const printerRecordsRef = useRef<PrinterLatestRecord[]>([])
  const simExpiryBranchesRef = useRef<SimExpiryBranch[]>([])

  const refresh = useCallback(async () => {
    const today = thaiDateYmd()
    const [jobRes, pendingTodayRes, shippedRes, serviceResult, printerRecords, simExpiryRes] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('deliveries').select('id', { count: 'exact', head: true })
        .eq('status', 'ต้องจัดส่ง')
        .gte('created_at', thaiDayStartIso(today))
        .lte('created_at', thaiDayEndIso(today)),
      supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('status', 'จัดส่งแล้ว'),
      fetchServiceRows().catch(() => [] as Awaited<ReturnType<typeof fetchServiceRows>>),
      fetchLatestPrinterRecords().catch(() => [] as PrinterLatestRecord[]),
      supabase.from('branches').select('sim_expiry_date').not('sim_expiry_date', 'is', null),
    ])
    const pendingToday = pendingTodayRes.count ?? 0
    const shipped = shippedRes.count ?? 0
    printerRecordsRef.current = printerRecords
    simExpiryBranchesRef.current = (simExpiryRes.data ?? []) as SimExpiryBranch[]
    setCounts({
      job: jobRes.count ?? 0,
      delivery: pendingToday + shipped,
      deliveryPendingToday: pendingToday,
      deliveryShipped: shipped,
      service: countZeroDayBranches(serviceResult),
      printer: countPrinterAlertBadge(printerRecords),
      settings: countSimExpiringWithin30Days(simExpiryBranchesRef.current),
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branches' }, () => refresh())
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

  useEffect(() => {
    const tick = setInterval(() => {
      if (simExpiryBranchesRef.current.length === 0) return
      const settings = countSimExpiringWithin30Days(simExpiryBranchesRef.current)
      setCounts((prev) => (prev.settings === settings ? prev : { ...prev, settings }))
    }, SIM_EXPIRY_TICK_MS)

    return () => clearInterval(tick)
  }, [])

  return { counts, refresh }
}
