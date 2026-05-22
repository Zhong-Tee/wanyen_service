import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface SalesSummaryRow {
  report_date: string
  branch_name: string
  row_count: number
  total_qty: number
  total_sales: number
}

export interface BranchSalesSummary {
  branch_name: string
  total_sales: number
}

export interface SalesReportData {
  rows: SalesSummaryRow[]
  totalSales: number
  byBranch: BranchSalesSummary[]
}

async function fetchSalesRange(dateFrom: string, dateTo: string): Promise<SalesReportData> {
  // ดึงข้อมูลแบบ pagination เพื่อหลีก server-side max-rows limit (default 1,000)
  const PAGE = 1000
  const allData: Record<string, unknown>[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('daily_sales_summary')
      .select('report_date, branch_name, row_count, total_qty, total_sales')
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)
      .order('report_date', { ascending: false })
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    allData.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  const rows: SalesSummaryRow[] = allData
    .filter((r) => r.branch_name != null && r.report_date != null)
    .map((r) => ({
      report_date: r.report_date as string,
      branch_name: r.branch_name as string,
      row_count: Number(r.row_count ?? 0),
      total_qty: Number(r.total_qty ?? 0),
      total_sales: Number(r.total_sales ?? 0),
    }))

  const totalSales = rows.reduce((sum, r) => sum + r.total_sales, 0)

  const branchMap = new Map<string, number>()
  for (const r of rows) {
    branchMap.set(r.branch_name, (branchMap.get(r.branch_name) ?? 0) + r.total_sales)
  }
  const byBranch: BranchSalesSummary[] = [...branchMap.entries()]
    .map(([branch_name, total_sales]) => ({ branch_name, total_sales }))
    .sort((a, b) => b.total_sales - a.total_sales)

  return { rows, totalSales, byBranch }
}

function fmtLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useSalesReport() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const fmt = fmtLocalDate

  const [dateFrom, setDateFrom] = useState(fmt(firstOfMonth))
  const [dateTo, setDateTo] = useState(fmt(today))
  const [compareMode, setCompareMode] = useState(false)
  const [dateFrom2, setDateFrom2] = useState(fmt(firstOfMonth))
  const [dateTo2, setDateTo2] = useState(fmt(today))

  const [data, setData] = useState<SalesReportData | null>(null)
  const [data2, setData2] = useState<SalesReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchSalesRange(dateFrom, dateTo)
      setData(result)
      if (compareMode) {
        const result2 = await fetchSalesRange(dateFrom2, dateTo2)
        setData2(result2)
      } else {
        setData2(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, compareMode, dateFrom2, dateTo2])

  return {
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    compareMode, setCompareMode,
    dateFrom2, setDateFrom2,
    dateTo2, setDateTo2,
    data, data2,
    loading, error,
    fetch,
  }
}
