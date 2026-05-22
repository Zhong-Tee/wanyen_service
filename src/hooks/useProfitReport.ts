import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch } from '../types'

export interface BranchProfitRow {
  branch_name: string
  total_sales: number
  total_qty: number
  cost_type: 'rent' | 'gp' | 'none'
  cost_value: number | null
  cost_amount: number
  profit: number
  matched: boolean  // true = พบสาขาใน branches table, false = ไม่พบ (ชื่อไม่ตรง)
}

interface SalesEntry { sales: number; qty: number }

async function fetchBranchSales(dateFrom: string, dateTo: string): Promise<Map<string, SalesEntry>> {
  const PAGE = 1000
  const map = new Map<string, SalesEntry>()
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('daily_sales_summary')
      .select('branch_name, total_sales, total_qty')
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const name = r.branch_name as string | null
      if (!name) continue
      const cur = map.get(name) ?? { sales: 0, qty: 0 }
      map.set(name, {
        sales: cur.sales + Number(r.total_sales ?? 0),
        qty:   cur.qty   + Number(r.total_qty   ?? 0),
      })
    }
    if (!data || data.length < PAGE) break
    offset += PAGE
  }

  return map
}

function calcMonthsBetween(dateFrom: string, dateTo: string): number {
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  const diff =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
  return Math.max(1, diff)
}

function fmtLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useProfitReport() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const fmt = fmtLocalDate

  const [dateFrom, setDateFrom] = useState(fmt(firstOfMonth))
  const [dateTo, setDateTo] = useState(fmt(today))
  const [rows, setRows] = useState<BranchProfitRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [salesMap, branchRes] = await Promise.all([
        fetchBranchSales(dateFrom, dateTo),
        supabase.from('branches').select('id, name, rent, gp_percent, is_active').order('name'),
      ])
      if (branchRes.error) throw new Error(branchRes.error.message)

      const months = calcMonthsBetween(dateFrom, dateTo)
      const branches = (branchRes.data ?? []) as Pick<Branch, 'id' | 'name' | 'rent' | 'gp_percent' | 'is_active'>[]

      // normalize ชื่อ: lowercase + ลด whitespace เหลือช่องเดียว
      const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

      // map 1: exact normalized match
      const branchByName = new Map(branches.map((b) => [normName(b.name), b]))

      // map 2: เลขนำหน้า → สาขา (fallback)
      // ถ้าเลขซ้ำกันในหลายสาขาให้ mark เป็น null (ambiguous — ไม่ใช้)
      type BranchRow = Pick<Branch, 'id' | 'name' | 'rent' | 'gp_percent' | 'is_active'>
      const branchByPrefix = new Map<string, BranchRow | null>()
      for (const b of branches) {
        const m = b.name.trim().match(/^(\d+)/)
        if (!m) continue
        const prefix = m[1]
        branchByPrefix.set(prefix, branchByPrefix.has(prefix) ? null : b)
      }

      const findBranch = (salesName: string): BranchRow | undefined => {
        // 1. exact match
        const exact = branchByName.get(normName(salesName))
        if (exact) return exact
        // 2. จับเลขนำหน้า เช่น "36 MS Future Rangsit 9:30" → "36"
        const m = salesName.trim().match(/^(\d+)/)
        if (m) {
          const byPrefix = branchByPrefix.get(m[1])
          if (byPrefix != null) return byPrefix
        }
        return undefined
      }

      // Loop จาก salesMap เป็นหลัก เพื่อให้ยอดรวมครบทุกสาขาที่มีข้อมูลขาย
      const result: BranchProfitRow[] = []
      salesMap.forEach(({ sales: total_sales, qty: total_qty }, salesBranchName) => {
        if (!salesBranchName) return
        const b = findBranch(salesBranchName)
        let cost_type: 'rent' | 'gp' | 'none' = 'none'
        let cost_amount = 0
        let cost_value: number | null = null

        if (b?.rent != null) {
          cost_type = 'rent'
          cost_value = b.rent
          cost_amount = b.rent * months
        } else if (b?.gp_percent != null) {
          cost_type = 'gp'
          cost_value = b.gp_percent
          cost_amount = total_sales * (b.gp_percent / 100)
        }

        result.push({
          branch_name: salesBranchName,
          total_sales,
          total_qty,
          cost_type,
          cost_value,
          cost_amount,
          profit: total_sales - cost_amount,
          matched: b !== undefined,
        })
      })

      // เรียงตามชื่อสาขา
      result.sort((a, b) => a.branch_name.localeCompare(b.branch_name, 'th'))
      setRows(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  const totalSales = rows.reduce((s, r) => s + r.total_sales, 0)
  const totalCost = rows.reduce((s, r) => s + r.cost_amount, 0)
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0)

  return {
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    rows, loading, error,
    totalSales, totalCost, totalProfit,
    fetch,
  }
}
