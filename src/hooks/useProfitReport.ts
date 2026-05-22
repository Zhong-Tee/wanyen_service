import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch } from '../types'

export interface BranchProfitRow {
  branch_name: string
  total_sales: number
  cost_type: 'rent' | 'gp' | 'none'
  cost_value: number | null
  cost_amount: number
  profit: number
}

async function fetchBranchSales(dateFrom: string, dateTo: string): Promise<Map<string, number>> {
  const PAGE = 1000
  const map = new Map<string, number>()
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('daily_sales_summary')
      .select('branch_name, total_sales')
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const name = r.branch_name as string | null
      if (!name) continue
      map.set(name, (map.get(name) ?? 0) + Number(r.total_sales ?? 0))
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
        supabase.from('branches').select('id, name, rent, gp_percent, is_active').eq('is_active', true).order('name'),
      ])
      if (branchRes.error) throw new Error(branchRes.error.message)

      const months = calcMonthsBetween(dateFrom, dateTo)
      const branches = (branchRes.data ?? []) as Pick<Branch, 'id' | 'name' | 'rent' | 'gp_percent' | 'is_active'>[]

      // สร้าง map ชื่อสาขา (lowercase) → ข้อมูลสาขา เพื่อ match แบบ case-insensitive
      const branchByName = new Map(branches.map((b) => [b.name.trim().toLowerCase(), b]))

      // Loop จาก salesMap เป็นหลัก เพื่อให้ยอดรวมครบทุกสาขาที่มีข้อมูลขาย
      const result: BranchProfitRow[] = []
      salesMap.forEach((total_sales, salesBranchName) => {
        if (!salesBranchName) return
        const b = branchByName.get(salesBranchName.trim().toLowerCase())
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
          cost_type,
          cost_value,
          cost_amount,
          profit: total_sales - cost_amount,
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
