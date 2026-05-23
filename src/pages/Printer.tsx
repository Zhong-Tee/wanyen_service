import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { fetchBranchOnlineMap } from '../lib/sheetCSV'
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  ROWS_PER_ROLL,
  formatStickerStock,
} from '../lib/stickerStock'

// ── Types ──────────────────────────────────────────────────────────────────────

type PrinterStatusKey = 'online' | 'printing' | 'offline' | 'paper_out' | 'ribbon_out' | 'error'

interface PrinterRecord {
  id: number
  branch_id: string
  branch_name: string
  printer_id: string
  printer_name: string
  printer_ip: string
  status: PrinterStatusKey
  page_count: number | null
  alert_msg: string | null
  event: string | null
  stock_remaining: number | null
  timestamp: string
}

// ── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PrinterStatusKey, { label: string; icon: string; color: string; dot: string }> = {
  online:     { label: 'พร้อมใช้งาน',   icon: '✅', color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  printing:   { label: 'กำลังปริ้น',     icon: '🖨️', color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  offline:    { label: 'ออฟไลน์',       icon: '🔴', color: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
  paper_out:  { label: 'กระดาษหมด',     icon: '📄', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  ribbon_out: { label: 'หมึกหมด',       icon: '🎀', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  error:      { label: 'เครื่องมีปัญหา', icon: '⚠️', color: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesSince(timestamp: string): number {
  return (Date.now() - new Date(timestamp).getTime()) / 60000
}

function getMonitorHealth(minutes: number): 'ok' | 'warning' | 'offline' {
  if (minutes < 6) return 'ok'
  if (minutes < 15) return 'warning'
  return 'offline'
}

function formatRelativeTime(timestamp: string): string {
  const mins = minutesSince(timestamp)
  if (mins < 1) return 'เมื่อกี้'
  if (mins < 60) return `${Math.floor(mins)} นาทีที่แล้ว`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชม. ที่แล้ว`
  return `${Math.floor(hours / 24)} วันที่แล้ว`
}

async function enqueuePrinterCommand(
  branchId: string,
  command: string,
  args: number[]
): Promise<void> {
  const { error } = await supabase.from('printer_command_queue').insert({
    branch_id: branchId,
    command,
    args,
    status: 'pending',
  })
  if (error) throw error
}

function sortPrinters(printers: PrinterRecord[]): PrinterRecord[] {
  return [...printers].sort((a, b) => a.printer_id.localeCompare(b.printer_id))
}

/** นาที — ถ้าสาขายังมีเครื่องที่ report อยู่ ให้ซ่อนเครื่องที่ไม่ report นานกว่านี้ (ลบออกจาก config แล้ว) */
const STALE_PRINTER_MINUTES = 15

function filterActivePrinters(printers: PrinterRecord[]): PrinterRecord[] {
  if (printers.length <= 1) return sortPrinters(printers)
  const sorted = sortPrinters(printers)
  const hasFresh = sorted.some((p) => minutesSince(p.timestamp) < STALE_PRINTER_MINUTES)
  if (!hasFresh) return sorted
  return sorted.filter((p) => minutesSince(p.timestamp) < STALE_PRINTER_MINUTES)
}

function groupByBranch(records: PrinterRecord[]): PrinterRecord[][] {
  const map = new Map<string, PrinterRecord[]>()
  records.forEach((r) => {
    const key = r.branch_id ?? r.branch_name
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  })
  return Array.from(map.values())
    .map((printers) => filterActivePrinters(printers))
    .filter((printers) => printers.length > 0)
    .sort((a, b) => a[0].branch_name.localeCompare(b[0].branch_name, 'th'))
}

// ── Printer Command Menu (ต่อแถวปริ้นเตอร์) ─────────────────────────────────

type Toast = { message: string; type: 'success' | 'error' }

interface PrinterCommandMenuProps {
  branchId: string
  printer: PrinterRecord
  printerIndex: number
  onToast: (toast: Toast) => void
}

function PrinterCommandMenu({
  branchId,
  printer,
  printerIndex,
  onToast,
}: PrinterCommandMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mode, setMode] = useState<'menu' | 'resetstock'>('menu')
  const [resetStock, setResetStock] = useState(String(ROWS_PER_ROLL))
  const [sending, setSending] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeAll = useCallback(() => {
    setMenuOpen(false)
    setMode('menu')
    setMenuPos(null)
  }, [])

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current
    const menu = menuRef.current
    if (!btn) return

    const btnRect = btn.getBoundingClientRect()
    const menuWidth = 200
    const menuHeight = menu?.offsetHeight ?? (mode === 'resetstock' ? 180 : 130)
    const bottomNavReserve = 72
    const spaceBelow = window.innerHeight - btnRect.bottom - bottomNavReserve
    const openUp = spaceBelow < menuHeight + 8

    const top = openUp
      ? Math.max(8, btnRect.top - menuHeight - 4)
      : btnRect.bottom + 4
    const left = Math.max(
      8,
      Math.min(btnRect.right - menuWidth, window.innerWidth - menuWidth - 8)
    )

    setMenuPos({ top, left })
  }, [mode])

  useEffect(() => {
    if (!menuOpen) return
    updateMenuPosition()
    const onScroll = () => closeAll()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', updateMenuPosition)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', updateMenuPosition)
    }
  }, [menuOpen, closeAll, updateMenuPosition])

  useEffect(() => {
    if (!menuOpen) return
    requestAnimationFrame(updateMenuPosition)
  }, [menuOpen, mode, updateMenuPosition])

  useEffect(() => {
    if (!menuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeAll()
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen, closeAll])

  const sendTestPrint = async () => {
    setSending(true)
    try {
      await enqueuePrinterCommand(branchId, 'testprint', [printerIndex, 1])
      onToast({
        message: `ส่ง Test Print สาขา ${branchId} · ${printer.printer_name} · 1 แผ่น`,
        type: 'success',
      })
      closeAll()
    } catch (e: unknown) {
      onToast({
        message: e instanceof Error ? e.message : 'ส่งคำสั่งไม่สำเร็จ',
        type: 'error',
      })
    } finally {
      setSending(false)
    }
  }

  const sendResetStock = async () => {
    const rows = parseInt(resetStock, 10)
    if (!rows || rows <= 0) {
      onToast({ message: 'กรุณาระบุจำนวนแถวที่ถูกต้อง', type: 'error' })
      return
    }
    setSending(true)
    try {
      await enqueuePrinterCommand(branchId, 'resetstock', [printerIndex, rows])
      onToast({
        message: `ส่ง Reset Stock สาขา ${branchId} · ${printer.printer_name} · ${rows.toLocaleString()} แถว`,
        type: 'success',
      })
      closeAll()
      setResetStock(String(ROWS_PER_ROLL))
    } catch (e: unknown) {
      onToast({
        message: e instanceof Error ? e.message : 'ส่งคำสั่งไม่สำเร็จ',
        type: 'error',
      })
    } finally {
      setSending(false)
    }
  }

  const menuDropdown =
    menuOpen &&
    menuPos &&
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[100] w-[200px] bg-white border border-gray-200 rounded-xl shadow-xl py-1 text-sm"
        style={{ top: menuPos.top, left: menuPos.left }}
      >
        {mode === 'menu' ? (
          <>
            <p className="text-xs text-gray-400 px-3 pt-2 pb-1 truncate">{printer.printer_name}</p>
            <button
              type="button"
              disabled={sending}
              onClick={() => void sendTestPrint()}
              className="w-full text-left px-3 py-2 hover:bg-pink-50 disabled:opacity-50"
            >
              🖨️ Test Print
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => setMode('resetstock')}
              className="w-full text-left px-3 py-2 hover:bg-pink-50 disabled:opacity-50 border-t border-gray-100"
            >
              📦 Reset Stock
            </button>
          </>
        ) : (
          <div className="px-3 py-2 space-y-2">
            <p className="text-xs text-gray-500 truncate">Reset Stock — {printer.printer_name}</p>
            <label className="block text-xs text-gray-500">
              จำนวนแถวใหม่
              <input
                type="number"
                min={1}
                value={resetStock}
                onChange={(e) => setResetStock(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </label>
            <button
              type="button"
              disabled={sending}
              onClick={() => void sendResetStock()}
              className="w-full text-xs font-medium text-white bg-pink-600 rounded-lg py-2 hover:bg-pink-700 disabled:opacity-50"
            >
              ยืนยัน Reset Stock
            </button>
            <button
              type="button"
              onClick={() => setMode('menu')}
              className="w-full text-xs text-gray-400 py-1 hover:text-gray-600"
            >
              ← กลับ
            </button>
          </div>
        )}
      </div>,
      document.body
    )

  return (
    <>
      <div className="relative flex-shrink-0">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setMenuOpen((v) => {
              if (v) {
                setMode('menu')
                setMenuPos(null)
                return false
              }
              return true
            })
          }}
          disabled={sending}
          className="text-xs font-medium text-pink-700 bg-white border border-pink-200 px-2.5 py-1 rounded-lg hover:bg-pink-50 disabled:opacity-50 shadow-sm"
        >
          คำสั่ง
        </button>
      </div>
      {menuDropdown}
    </>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function usePrinterStatus() {
  const [data, setData] = useState<PrinterRecord[]>([])
  const [branchOnlineMap, setBranchOnlineMap] = useState<Map<string, 'online' | 'offline'>>(
    new Map()
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [printerResult, onlineMap] = await Promise.all([
        supabase
          .from('printer_log')
          .select(
            'id, branch_id, branch_name, printer_id, printer_name, printer_ip, status, page_count, alert_msg, event, stock_remaining, timestamp'
          )
          .order('timestamp', { ascending: false })
          .limit(2000),
        fetchBranchOnlineMap().catch(() => new Map<string, 'online' | 'offline'>()),
      ])

      const { data: rows, error: err } = printerResult
      if (err) throw err

      // เก็บแค่ record แรก (ล่าสุด) ของแต่ละ branch_id + printer_id คู่กัน
      // (ทุกสาขาใช้ชื่อ printer_id ซ้ำกัน เช่น printer_01 ต้องแยกด้วย branch_id)
      const seen = new Set<string>()
      const latest = ((rows ?? []) as PrinterRecord[]).filter((r) => {
        const key = `${r.branch_id}__${r.printer_id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      setData(latest)
      setBranchOnlineMap(onlineMap)
      setLastRefresh(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { data, branchOnlineMap, loading, error, lastRefresh, refresh }
}

// ── Main Component ────────────────────────────────────────────────────────────

function isBranchMachineOffline(
  branchId: string | null | undefined,
  branchOnlineMap: Map<string, 'online' | 'offline'>
): boolean {
  if (!branchId) return false
  return branchOnlineMap.get(branchId) === 'offline'
}

export function Printer() {
  const { data, branchOnlineMap, loading, error, lastRefresh, refresh } = usePrinterStatus()
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Group by branch — ซ่อนเครื่องที่ไม่ได้ report แล้ว (เช่น ลบออกจาก config)
  const activeBranchGroups = useMemo(() => groupByBranch(data), [data])

  const branchGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeBranchGroups
    return activeBranchGroups.filter((printers) => {
      const branch = printers[0]
      return (
        branch.branch_name.toLowerCase().includes(q) ||
        branch.branch_id?.toLowerCase().includes(q) ||
        printers.some((p) => p.printer_name.toLowerCase().includes(q))
      )
    })
  }, [activeBranchGroups, search])

  // Summary counts (นับเฉพาะเครื่องที่ยัง active)
  const summary = useMemo(() => {
    const active = activeBranchGroups.flat()
    const total = active.length
    const normal = active.filter((r) => r.status === 'online' || r.status === 'printing').length
    const problem = active.filter((r) => r.status !== 'online' && r.status !== 'printing').length
    const monitorOffline = active.filter(
      (r) => getMonitorHealth(minutesSince(r.timestamp)) === 'offline'
    ).length
    const machineOffline = new Set(
      active
        .filter((r) => isBranchMachineOffline(r.branch_id, branchOnlineMap))
        .map((r) => r.branch_id)
    ).size
    return { total, normal, problem, monitorOffline, machineOffline }
  }, [activeBranchGroups, branchOnlineMap])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Printer Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            สถานะปริ้นเตอร์แบบ Real-time
            {lastRefresh && (
              <span className="ml-2 text-xs text-gray-400">
                · อัปเดต{' '}
                {lastRefresh.toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-pink-600 font-medium bg-pink-50 px-3 py-1.5 rounded-lg hover:bg-pink-100 disabled:opacity-50 flex-shrink-0"
        >
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
          รีเฟรช
        </button>
      </div>

      {/* Summary cards */}
      {!loading && activeBranchGroups.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
            <p className="text-xl">🖨️</p>
            <p className="text-xl font-bold text-gray-800 mt-1">{summary.total}</p>
            <p className="text-xs text-gray-500 mt-0.5">ทั้งหมด</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-xl">✅</p>
            <p className="text-xl font-bold text-green-700 mt-1">{summary.normal}</p>
            <p className="text-xs text-green-600 mt-0.5">ปกติ</p>
          </div>
          <div
            className={`rounded-xl p-3 text-center border ${
              summary.problem > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
            }`}
          >
            <p className="text-xl">⚠️</p>
            <p
              className={`text-xl font-bold mt-1 ${
                summary.problem > 0 ? 'text-red-700' : 'text-gray-400'
              }`}
            >
              {summary.problem}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                summary.problem > 0 ? 'text-red-600' : 'text-gray-400'
              }`}
            >
              มีปัญหา
            </p>
          </div>
          <div
            className={`rounded-xl p-3 text-center border ${
              summary.monitorOffline > 0
                ? 'bg-orange-50 border-orange-200'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <p className="text-xl">📡</p>
            <p
              className={`text-xl font-bold mt-1 ${
                summary.monitorOffline > 0 ? 'text-orange-700' : 'text-gray-400'
              }`}
            >
              {summary.monitorOffline}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                summary.monitorOffline > 0 ? 'text-orange-600' : 'text-gray-400'
              }`}
            >
              Monitor ไม่ตอบ
            </p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">
          ⚠️ {error}
        </div>
      )}

      {/* Search */}
      {activeBranchGroups.length > 0 && (
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อสาขา, เลขสาขา, ปริ้นเตอร์..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state — ยังไม่มีข้อมูลเลย */}
      {!loading && !error && data.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-4xl mb-2">🖨️</p>
          <p className="text-gray-500 font-medium">ยังไม่มีข้อมูลปริ้นเตอร์</p>
          <p className="text-gray-400 text-sm mt-1">
            ตรวจสอบว่า printer_monitor.py กำลังทำงานและเชื่อมต่อ Supabase อยู่
          </p>
        </div>
      )}

      {/* No search results */}
      {!loading && search && branchGroups.length === 0 && activeBranchGroups.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-gray-400 text-sm">ไม่พบสาขาที่ค้นหา</p>
        </div>
      )}

      {/* Branch cards */}
      {!loading && branchGroups.length > 0 && (
        <div className="space-y-3">
          {branchGroups.map((printers) => {
            const branch = printers[0]
            const maxMins = Math.max(...printers.map((p) => minutesSince(p.timestamp)))
            const monitorHealth = getMonitorHealth(maxMins)
            const machineOffline = isBranchMachineOffline(branch.branch_id, branchOnlineMap)
            const hasProblem = printers.some(
              (p) => p.status !== 'online' && p.status !== 'printing'
            )

            return (
              <section
                key={branch.branch_id ?? branch.branch_name}
                className={`bg-white rounded-2xl shadow-sm border overflow-visible ${
                  machineOffline
                    ? 'border-red-300'
                    : monitorHealth === 'offline'
                    ? 'border-orange-300'
                    : hasProblem
                    ? 'border-red-200'
                    : 'border-gray-100'
                }`}
              >
                {/* Branch header */}
                <div
                  className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${
                    machineOffline
                      ? 'bg-red-50 border-red-200'
                      : monitorHealth === 'offline'
                      ? 'bg-orange-50 border-orange-200'
                      : hasProblem
                      ? 'bg-red-50 border-red-100'
                      : 'bg-gradient-to-r from-pink-50 to-purple-50 border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 text-xs font-bold bg-pink-600 text-white px-2 py-0.5 rounded">
                      {branch.branch_id ?? '—'}
                    </span>
                    <span className="font-semibold text-gray-800 text-sm truncate">
                      {branch.branch_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {machineOffline && (
                      <span className="text-xs font-bold text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">
                        📴 เครื่อง Offline
                      </span>
                    )}
                    {!machineOffline && monitorHealth === 'offline' && (
                      <span className="text-xs font-bold text-orange-700 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-full">
                        📡 Monitor ไม่ตอบ
                      </span>
                    )}
                    {!machineOffline && monitorHealth === 'warning' && (
                      <span className="text-xs font-bold text-yellow-700 bg-yellow-100 border border-yellow-300 px-2 py-0.5 rounded-full">
                        ⏱ ช้ากว่าปกติ
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{printers.length} เครื่อง</span>
                  </div>
                </div>

                {/* Printer rows */}
                <div className="divide-y divide-gray-50">
                  {sortPrinters(printers).map((p, printerIndex) => {
                    const effectiveStatus: PrinterStatusKey = machineOffline
                      ? 'offline'
                      : p.status
                    const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.error
                    const mins = minutesSince(p.timestamp)
                    const health = getMonitorHealth(mins)
                    const isNormal =
                      !machineOffline &&
                      (p.status === 'online' || p.status === 'printing')

                    return (
                      <div
                        key={`${p.branch_id}__${p.printer_id}`}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        {/* Status dot */}
                        <span
                          className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${cfg.dot} ${
                            isNormal ? 'animate-pulse' : ''
                          }`}
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">
                              {p.printer_name}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}
                            >
                              {cfg.icon} {cfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-400">{p.printer_ip}</span>
                            {p.stock_remaining != null && (
                              <span
                                className={`text-xs font-medium ${
                                  p.stock_remaining <= DEFAULT_LOW_STOCK_THRESHOLD
                                    ? 'text-red-500'
                                    : 'text-gray-500'
                                }`}
                              >
                                📦 {formatStickerStock(p.stock_remaining)}
                                {p.stock_remaining <= DEFAULT_LOW_STOCK_THRESHOLD && ' ⚠️'}
                              </span>
                            )}
                            {p.alert_msg && (
                              <span
                                className="text-xs text-red-500 truncate max-w-[180px]"
                                title={p.alert_msg}
                              >
                                ⚡ {p.alert_msg}
                              </span>
                            )}
                          </div>
                        </div>

                        {branch.branch_id && (
                          <PrinterCommandMenu
                            branchId={branch.branch_id}
                            printer={p}
                            printerIndex={printerIndex}
                            onToast={setToast}
                          />
                        )}

                        {/* Timestamp */}
                        <div className="text-right flex-shrink-0 min-w-[72px]">
                          <p
                            className={`text-xs font-medium ${
                              health === 'offline'
                                ? 'text-orange-600'
                                : health === 'warning'
                                ? 'text-yellow-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {formatRelativeTime(p.timestamp)}
                          </p>
                          {p.page_count != null && (
                            <p className="text-xs text-gray-300 mt-0.5">
                              {p.page_count.toLocaleString()} ใบ
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
