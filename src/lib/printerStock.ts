import { supabase } from './supabase'
import { rowsToSheets } from './stickerStock'

/** ดึงเลขสาขานำหน้า เช่น "03 WY Fortune" → "3", "03" → "3" */
export function extractBranchNum(value: string): string | null {
  const trimmed = value.trim()
  const fromName = trimmed.match(/^0*(\d+)/)
  if (fromName) return fromName[1]
  return null
}

function normBranchKey(value: string): string | null {
  return extractBranchNum(value)
}

function normProductKey(value: string): string {
  return value.trim().toLowerCase()
}

function branchProductKey(branchKey: string, productName: string): string {
  return `${branchKey}__${normProductKey(productName)}`
}

export type BranchProductPrinterSheetsLookup = {
  /** PT แผ่นต่อสินค้า (ไม่รวมปริ้นเตอร์อื่น) */
  get(branchName: string, productName: string): number | null
}

/**
 * ดึง stock_remaining ล่าสุดต่อปริ้นเตอร์ แล้วจับคู่กับสินค้าผ่าน product_name ใน printer_log
 * fallback: สาขามีปริ้นเตอร์เดียว + ไม่มี product_name → ใช้สต็อกปริ้นเตอร์นั้นเมื่อมีสินค้าเดียว
 */
export async function fetchBranchProductPrinterSheetsLookup(): Promise<BranchProductPrinterSheetsLookup> {
  const { data, error } = await supabase
    .from('printer_log')
    .select('branch_id, branch_name, printer_id, product_name, stock_remaining, timestamp')
    .order('timestamp', { ascending: false })
    .limit(2000)

  if (error) throw error

  const seen = new Set<string>()
  type PrinterRow = {
    branchId: string
    branchName: string
    productName: string | null
    rows: number
  }
  const printers: PrinterRow[] = []

  for (const row of data ?? []) {
    const printerKey = `${row.branch_id}__${row.printer_id}`
    if (seen.has(printerKey)) continue
    seen.add(printerKey)

    if (row.stock_remaining == null) continue

    printers.push({
      branchId: String(row.branch_id ?? '').trim(),
      branchName: String(row.branch_name ?? '').trim(),
      productName: row.product_name ? String(row.product_name).trim() : null,
      rows: Number(row.stock_remaining),
    })
  }

  const sheetsByBranchProduct = new Map<string, number>()

  for (const p of printers) {
    if (!p.productName) continue

    const productKey = normProductKey(p.productName)
    const numKey = normBranchKey(p.branchId) ?? normBranchKey(p.branchName)
    const sheets = rowsToSheets(p.rows)

    if (p.branchName) {
      const nameKey = branchProductKey(p.branchName, productKey)
      sheetsByBranchProduct.set(nameKey, (sheetsByBranchProduct.get(nameKey) ?? 0) + sheets)
    }
    if (numKey) {
      const numProductKey = branchProductKey(numKey, productKey)
      sheetsByBranchProduct.set(
        numProductKey,
        (sheetsByBranchProduct.get(numProductKey) ?? 0) + sheets
      )
    }
  }

  const legacySinglePrinter = new Map<string, number>()
  const printersByBranch = new Map<string, PrinterRow[]>()
  for (const p of printers) {
    const numKey = normBranchKey(p.branchId) ?? normBranchKey(p.branchName)
    const keys = new Set<string>()
    if (p.branchName) keys.add(p.branchName)
    if (numKey) keys.add(numKey)
    for (const k of keys) {
      if (!printersByBranch.has(k)) printersByBranch.set(k, [])
      printersByBranch.get(k)!.push(p)
    }
  }
  printersByBranch.forEach((list, branchKey) => {
    const withoutProduct = list.filter((p) => !p.productName)
    if (list.length === 1 && withoutProduct.length === 1) {
      legacySinglePrinter.set(branchKey, rowsToSheets(withoutProduct[0].rows))
    }
  })

  return {
    get(branchName: string, productName: string): number | null {
      const trimmedBranch = branchName.trim()
      const trimmedProduct = productName.trim()
      const productNorm = normProductKey(trimmedProduct)

      const nameKey = branchProductKey(trimmedBranch, productNorm)
      if (sheetsByBranchProduct.has(nameKey)) return sheetsByBranchProduct.get(nameKey)!

      const numKey = normBranchKey(trimmedBranch)
      if (numKey) {
        const numProductKey = branchProductKey(numKey, productNorm)
        if (sheetsByBranchProduct.has(numProductKey)) {
          return sheetsByBranchProduct.get(numProductKey)!
        }
      }

      const legacy =
        legacySinglePrinter.get(trimmedBranch) ??
        (numKey ? legacySinglePrinter.get(numKey) : undefined)
      if (legacy != null) return legacy

      return null
    },
  }
}

/** @deprecated ใช้ fetchBranchProductPrinterSheetsLookup */
export type BranchPrinterSheetsLookup = BranchProductPrinterSheetsLookup

export async function fetchBranchPrinterSheetsLookup(): Promise<BranchProductPrinterSheetsLookup> {
  return fetchBranchProductPrinterSheetsLookup()
}
