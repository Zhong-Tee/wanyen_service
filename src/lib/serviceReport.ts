import { supabase } from './supabase'
import { fetchBranchProductPrinterSheetsLookup } from './printerStock'

export interface ServiceRow {
  branch_name: string
  product_name: string
  quantity: number
  avg_daily_sales: number
  days_remaining: number
  printer_sheets: number | null
}

function last7DayRange() {
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 6)
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${day}`
  }
  return { from: fmt(sevenDaysAgo), to: fmt(today) }
}

function branchProductSalesKey(branchName: string, productName: string): string {
  return `${branchName.trim()}__${productName.trim().toLowerCase()}`
}

/** ดึงและคำนวณรายการ Service จากสต๊อก + ยอดขาย 7 วัน (แยกตามสินค้า) */
export async function fetchServiceRows(): Promise<ServiceRow[]> {
  const { from, to } = last7DayRange()

  const [stockRes, salesRes, printerLookup] = await Promise.all([
    supabase
      .from('branch_stock_view')
      .select('branch_name, product_name, quantity')
      .eq('status', 'กำลังใช้'),
    supabase
      .from('daily_sales_report')
      .select('branch_name, product_name, report_date, quantity')
      .gte('report_date', from)
      .lte('report_date', to)
      .limit(50000),
    fetchBranchProductPrinterSheetsLookup().catch(() => null),
  ])

  if (stockRes.error) throw new Error(stockRes.error.message)
  if (salesRes.error) throw new Error(salesRes.error.message)

  const salesByBranchProduct = new Map<string, { totalQty: number; days: Set<string> }>()
  for (const r of salesRes.data ?? []) {
    const branch = r.branch_name as string | null
    const product = r.product_name as string | null
    if (!branch || !product) continue
    const key = branchProductSalesKey(branch, product)
    if (!salesByBranchProduct.has(key)) {
      salesByBranchProduct.set(key, { totalQty: 0, days: new Set() })
    }
    const entry = salesByBranchProduct.get(key)!
    entry.totalQty += Number(r.quantity ?? 0)
    entry.days.add(r.report_date as string)
  }

  const avgMap = new Map<string, number>()
  salesByBranchProduct.forEach((v, k) => {
    const dayCount = v.days.size || 7
    avgMap.set(k, v.totalQty / dayCount)
  })

  const result: ServiceRow[] = (stockRes.data ?? [])
    .filter((s) => s.branch_name != null && s.product_name != null)
    .map((s) => {
      const branch_name = s.branch_name as string
      const product_name = s.product_name as string
      const quantity = Number(s.quantity ?? 0)
      const avg_daily_sales = avgMap.get(branchProductSalesKey(branch_name, product_name)) ?? 0
      const days_remaining = avg_daily_sales > 0 ? Math.floor(quantity / avg_daily_sales) : 9999
      const printer_sheets = printerLookup?.get(branch_name, product_name) ?? null
      return { branch_name, product_name, quantity, avg_daily_sales, days_remaining, printer_sheets }
    })

  result.sort((a, b) => a.days_remaining - b.days_remaining)
  return result
}

/** นับจำนวนสาขา (unique) ที่เหลือสต๊อก 0 วัน — ควรเข้า Service วันนี้ */
export function countZeroDayBranches(rows: ServiceRow[]): number {
  const branches = new Set<string>()
  for (const r of rows) {
    if (r.days_remaining === 0) branches.add(r.branch_name)
  }
  return branches.size
}
