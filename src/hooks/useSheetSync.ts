import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchSheetRows } from '../lib/sheetCSV'

const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 นาที

export type UnmatchedReason = 'no_branch' | 'no_product' | 'no_active_stock'

export interface SyncUnmatched {
  branchName: string
  branchNum: string
  productName: string
  reason: UnmatchedReason
}

export interface SyncDiag {
  sheetRowCount: number
  sheetBranchNums: string[]
  supabaseBranchNums: string[]
  supabaseProducts: string[]
  activeStockCount: number
}

export interface SyncResult {
  updatedCount: number
  unmatched: SyncUnmatched[]
  lastSync: Date
  sheetDataDate: string   // วันที่ล่าสุดใน Sheet (DD/MM/YYYY)
  sheetDataTime: string   // เวลาล่าสุดใน Sheet (HH:MM:SS)
  diag: SyncDiag
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useSheetSync() {
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const sync = useCallback(async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      // ── 1. Fetch rows จาก Apps Script (real-time, ไม่มี cache) ──────────
      const parsed = await fetchSheetRows()

      // ── 2. กรองสินค้า Ribbon ออก แล้วเตรียม rows ─────────────────────
      const allRows = parsed
        .filter((r) => !r.productName.toLowerCase().includes('ribbon'))

      // ── 3. กรองเฉพาะข้อมูลวันที่+เวลาล่าสุดต่อ (branch × product) ────
      type SheetRowType = typeof allRows[0]
      const latestMap = new Map<string, SheetRowType>()
      for (const row of allRows) {
        const key = `${row.branchNum}__${row.productName.toLowerCase()}`
        const existing = latestMap.get(key)
        if (!existing || row.dateTime > existing.dateTime) latestMap.set(key, row)
      }
      const sheetRows = [...latestMap.values()]

      // ── 4. ดึงข้อมูล Supabase ─────────────────────────────────────────
      const [brRes, prRes, stRes] = await Promise.all([
        supabase.from('branches').select('id, name'),
        supabase.from('products').select('id, name'),
        // ดึงทั้งหมดแล้ว filter ใน code เพื่อความแน่ใจ
        supabase.from('branch_stock').select('id, branch_id, product_id, status'),
      ])

      const branches = brRes.data ?? []
      const products = prRes.data ?? []
      const allStock = stRes.data ?? []
      const activeStock = allStock.filter((s) => s.status === 'กำลังใช้')

      // ── 5. Lookup maps ────────────────────────────────────────────────
      const branchByNum = new Map<string, { id: string; name: string }>()
      for (const b of branches) {
        const num = b.name.match(/^(\d+)/)?.[1]
        if (num) branchByNum.set(num, b)
      }

      const productByName = new Map<string, { id: string; name: string }>()
      for (const p of products) {
        productByName.set(p.name.toLowerCase(), p)
      }

      const stockMap = new Map<string, string[]>()
      for (const s of activeStock) {
        const key = `${s.branch_id}__${s.product_id}`
        const arr = stockMap.get(key) ?? []
        arr.push(s.id)
        stockMap.set(key, arr)
      }

      // ── Diagnostic ────────────────────────────────────────────────────
      const diag: SyncDiag = {
        sheetRowCount: sheetRows.length,
        sheetBranchNums: [...new Set(sheetRows.map((r) => r.branchNum))].sort(),
        supabaseBranchNums: branches
          .map((b) => { const n = b.name.match(/^(\d+)/)?.[1]; return n ? `${n}→${b.name}` : null })
          .filter(Boolean) as string[],
        supabaseProducts: products.map((p) => p.name),
        activeStockCount: activeStock.length,
      }
      console.log('[SheetSync] diag:', diag)

      // ── 6. Match & collect updates ────────────────────────────────────
      const unmatched: SyncUnmatched[] = []
      const seenUnmatched = new Set<string>()
      const updates: { id: string; quantity: number }[] = []

      for (const row of sheetRows) {
        const branch = branchByNum.get(row.branchNum)
        if (!branch) {
          const k = `nb_${row.branchNum}_${row.productName}`
          if (!seenUnmatched.has(k)) {
            seenUnmatched.add(k)
            unmatched.push({ branchName: row.branchName, branchNum: row.branchNum, productName: row.productName, reason: 'no_branch' })
          }
          continue
        }

        const product = productByName.get(row.productName.toLowerCase())
        if (!product) {
          const k = `np_${row.branchNum}_${row.productName}`
          if (!seenUnmatched.has(k)) {
            seenUnmatched.add(k)
            unmatched.push({ branchName: row.branchName, branchNum: row.branchNum, productName: row.productName, reason: 'no_product' })
          }
          continue
        }

        const stockIds = stockMap.get(`${branch.id}__${product.id}`)
        if (!stockIds || stockIds.length === 0) continue

        for (const id of stockIds) {
          updates.push({ id, quantity: row.quantity })
        }
      }

      // ── 7. Batch update ───────────────────────────────────────────────
      if (updates.length > 0) {
        const now = new Date().toISOString()
        await Promise.all(
          updates.map((u) =>
            supabase
              .from('branch_stock')
              .update({ quantity: u.quantity, updated_at: now })
              .eq('id', u.id)
          )
        )
      }

      // หาวันที่+เวลาล่าสุดจาก parsed ทั้งหมด (ก่อน filter) เพื่อให้ได้ snapshot จริง
      const latestRow = parsed.reduce<typeof parsed[0] | null>((best, r) =>
        !best || r.dateTime > best.dateTime ? r : best, null)
      const sheetDataDate = latestRow?.dateRaw ?? ''
      const sheetDataTime = latestRow?.timeRaw ?? ''

      console.log(`[SheetSync] done — updated: ${updates.length}, unmatched: ${unmatched.length}`)
      setResult({ updatedCount: updates.length, unmatched, lastSync: new Date(), sheetDataDate, sheetDataTime, diag })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ'
      console.error('[SheetSync] error:', err)
      setSyncError(msg)
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    sync()
    intervalRef.current = setInterval(sync, SYNC_INTERVAL_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [sync])

  return { syncing, syncError, result, sync }
}
