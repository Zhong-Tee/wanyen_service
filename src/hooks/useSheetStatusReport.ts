import { useState, useCallback } from 'react'
import { fetchSheetRows, parseThaiDateTime } from '../lib/sheetCSV'

export interface BranchDetail {
  branchName: string
  branchNum: string
  products?: string[]  // สินค้าที่เกี่ยวข้อง (optional)
}

export interface MachineStatusSummary {
  snapshotDate: string    // DD/MM/YYYY
  snapshotTime: string    // HH:MM:SS
  totalBranches: number
  offline: BranchDetail[]
  online: BranchDetail[]
  stockEmpty: BranchDetail[]     // สินค้าหมด
  stockLow: BranchDetail[]       // สินค้าใกล้หมด
  stockClosed: BranchDetail[]    // ปิดสินค้า
  inkEmpty: BranchDetail[]       // Ribbon quantity < 0
  notSync: BranchDetail[]        // last update > 5 min behind snapshot
}

function uniqueBranches(pairs: { branchName: string; branchNum: string; product?: string }[]): BranchDetail[] {
  const map = new Map<string, BranchDetail>()
  for (const p of pairs) {
    const existing = map.get(p.branchNum)
    if (!existing) {
      map.set(p.branchNum, { branchName: p.branchName, branchNum: p.branchNum, products: p.product ? [p.product] : [] })
    } else if (p.product && !existing.products?.includes(p.product)) {
      existing.products?.push(p.product)
    }
  }
  return [...map.values()].sort((a, b) => a.branchNum.localeCompare(b.branchNum, undefined, { numeric: true }))
}

export function useSheetStatusReport() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<MachineStatusSummary | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const allRows = await fetchSheetRows()
      if (allRows.length === 0) throw new Error('ไม่พบข้อมูลใน Sheet')

      // ── หา snapshot ล่าสุด (max dateTime) ────────────────────────────
      const maxDT = allRows.reduce((best, r) => r.dateTime > best ? r.dateTime : best, '')
      const snapshotRows = allRows.filter((r) => r.dateTime === maxDT)
      const snapshotDate = snapshotRows[0].dateRaw
      const snapshotTime = snapshotRows[0].timeRaw

      // snapshot เป็น Date object เพื่อเปรียบเทียบ Not Sync
      const [sd, sm, sy] = snapshotDate.split('/')
      const [sh, smin, ss] = snapshotTime.split(':')
      const snapshotDt = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd), parseInt(sh), parseInt(smin), parseInt(ss))

      // ── นับสาขา unique ──────────────────────────────────────────────
      const totalBranches = new Set(snapshotRows.map((r) => r.branchNum)).size

      // Offline / Online
      const offlinePairs = snapshotRows
        .filter((r) => r.onlineStatus.toLowerCase() === 'offline')
        .map((r) => ({ branchName: r.branchName, branchNum: r.branchNum }))

      const onlinePairs = snapshotRows
        .filter((r) => r.onlineStatus.toLowerCase() === 'online')
        .map((r) => ({ branchName: r.branchName, branchNum: r.branchNum }))

      // สินค้าหมด: เฉพาะรายการที่จำนวน <= 0
      const stockEmptyPairs = snapshotRows
        .filter((r) => r.stockStatus === 'สินค้าหมด' && r.quantity <= 0)
        .map((r) => ({ branchName: r.branchName, branchNum: r.branchNum, product: `${r.productName} (${r.quantity.toLocaleString()} แผ่น)` }))

      // สินค้าใกล้หมด: เฉพาะรายการที่จำนวน <= 50
      const stockLowPairs = snapshotRows
        .filter((r) => r.stockStatus === 'สินค้าใกล้หมด' && r.quantity <= 50)
        .map((r) => ({ branchName: r.branchName, branchNum: r.branchNum, product: `${r.productName} (${r.quantity.toLocaleString()} แผ่น)` }))

      // ปิดสินค้า: คอลัมน์ E มีคำว่า "ปิดใช้งาน" หรือ "ปิดสินค้า"
      const stockClosedPairs = snapshotRows
        .filter((r) => r.stockStatus === 'ปิดใช้งาน' || r.stockStatus === 'ปิดสินค้า')
        .map((r) => ({ branchName: r.branchName, branchNum: r.branchNum, product: `${r.productName} (${r.quantity.toLocaleString()} แผ่น)` }))

      // หมึกหมด: Ribbon quantity < 0
      const inkEmptyPairs = snapshotRows
        .filter((r) => r.productName.toLowerCase().includes('ribbon') && r.quantity < 0)
        .map((r) => ({ branchName: r.branchName, branchNum: r.branchNum, product: `${r.productName} (${r.quantity.toLocaleString()} แผ่น)` }))

      // Not Sync: เวลา sync ของเครื่อง (col H) ช้ากว่าเวลา snapshot (col A+B) เกิน 5 นาที
      const notSyncPairs = snapshotRows
        .filter((r) => {
          const machineDt = parseThaiDateTime(r.lastUpdateRaw)
          if (!machineDt) return false
          const diffMin = (snapshotDt.getTime() - machineDt.getTime()) / 60000
          return diffMin > 5
        })
        .map((r) => ({ branchName: r.branchName, branchNum: r.branchNum }))

      setSummary({
        snapshotDate,
        snapshotTime,
        totalBranches,
        offline: uniqueBranches(offlinePairs),
        online: uniqueBranches(onlinePairs),
        stockEmpty: uniqueBranches(stockEmptyPairs),
        stockLow: uniqueBranches(stockLowPairs),
        stockClosed: uniqueBranches(stockClosedPairs),
        inkEmpty: uniqueBranches(inkEmptyPairs),
        notSync: uniqueBranches(notSyncPairs),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }, [])

  return { summary, loading, error, fetch }
}
