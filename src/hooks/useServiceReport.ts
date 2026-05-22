import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface ServiceRow {
  branch_name: string
  product_name: string
  quantity: number
  avg_daily_sales: number
  days_remaining: number
}

export function useServiceReport() {
  const [rows, setRows] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterDays, setFilterDays] = useState<number | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const today = new Date()
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(today.getDate() - 6)
      const fmt = (d: Date) => {
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${mo}-${day}`
      }

      const [stockRes, salesRes] = await Promise.all([
        supabase
          .from('branch_stock_view')
          .select('branch_name, product_name, quantity')
          .eq('status', 'กำลังใช้'),
        supabase
          .from('daily_sales_summary')
          .select('branch_name, report_date, total_qty')
          .gte('report_date', fmt(sevenDaysAgo))
          .lte('report_date', fmt(today))
          .limit(5000),
      ])

      if (stockRes.error) throw new Error(stockRes.error.message)
      if (salesRes.error) throw new Error(salesRes.error.message)

      // คำนวณค่าเฉลี่ยยอดขาย 7 วัน (ต่อวัน) ต่อสาขา
      const salesByBranch = new Map<string, { totalQty: number; days: Set<string> }>()
      for (const r of salesRes.data ?? []) {
        const name = r.branch_name as string | null
        if (!name) continue
        if (!salesByBranch.has(name)) salesByBranch.set(name, { totalQty: 0, days: new Set() })
        const entry = salesByBranch.get(name)!
        entry.totalQty += Number(r.total_qty ?? 0)
        entry.days.add(r.report_date as string)
      }

      const avgMap = new Map<string, number>()
      salesByBranch.forEach((v, k) => {
        const dayCount = v.days.size || 7
        avgMap.set(k, v.totalQty / dayCount)
      })

      const result: ServiceRow[] = (stockRes.data ?? [])
        .filter((s) => s.branch_name != null && s.product_name != null)
        .map((s) => {
        const branch_name = s.branch_name as string
        const product_name = s.product_name as string
        const quantity = Number(s.quantity ?? 0)
        const avg_daily_sales = avgMap.get(branch_name) ?? 0
        const days_remaining = avg_daily_sales > 0 ? Math.floor(quantity / avg_daily_sales) : 9999

        return { branch_name, product_name, quantity, avg_daily_sales, days_remaining }
      })

      // เรียงจากน้อยไปมาก
      result.sort((a, b) => a.days_remaining - b.days_remaining)
      setRows(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }, [])

  const filteredRows = filterDays == null
    ? rows
    : rows.filter((r) => r.days_remaining <= filterDays)

  return { rows: filteredRows, allRows: rows, loading, error, filterDays, setFilterDays, fetch }
}
