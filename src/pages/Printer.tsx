import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { fetchBranchOnlineMap } from '../lib/sheetCSV'
import { useBranches } from '../hooks/useBranches'
import { extractBranchNumForQueue } from '../lib/printerCommandQueue'
import { extractBranchNum } from '../lib/printerStock'
import {
  countPrinterAlertSummary,
  fetchLatestPrinterRecords,
  getMonitorHealth,
  groupByBranch,
  isPrinterNormal,
  minutesSince,
  type PrinterLatestRecord,
  type PrinterStatusKey,
} from '../lib/printerAlerts'
import type { Branch, StoreGroup } from '../types'
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  ROWS_PER_ROLL,
  formatStickerStock,
} from '../lib/stickerStock'

// ── Types ──────────────────────────────────────────────────────────────────────

type PrinterRecord = PrinterLatestRecord

/** ชื่อสถานะภาษาอังกฤษ default ตามประเภท (เมื่อยังไม่มี log ใหม่) */
const ENGLISH_STATUS_LABELS: Record<PrinterStatusKey, string> = {
  online: 'Ready',
  printing: 'Printing',
  offline: 'Offline',
  paper_out: 'Paper Out',
  ribbon_out: 'Ribbon Out',
  error: 'Error',
}

/** ชื่อสถานะที่แสดง — จากปริ้นเตอร์จริง (Ready, Carriage Open) */
function getPrinterDisplayLabel(p: PrinterRecord): string {
  const fromLabel = p.status_label?.trim()
  if (fromLabel) return fromLabel

  const fromAlert = p.alert_msg?.trim()
  if (fromAlert && fromAlert.length <= 100) return fromAlert

  return ENGLISH_STATUS_LABELS[p.status] ?? p.status
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

function filterProblemBranchGroups(groups: PrinterRecord[][]): PrinterRecord[][] {
  return groups
    .map((printers) => printers.filter((p) => !isPrinterNormal(p)))
    .filter((printers) => printers.length > 0)
}

function filterMonitorOfflineBranchGroups(
  groups: PrinterRecord[][],
  branchOnlineMap: Map<string, 'online' | 'offline'>
): PrinterRecord[][] {
  return groups.filter((printers) => {
    const branch = printers[0]
    const maxMins = Math.max(...printers.map((p) => minutesSince(p.timestamp)))
    return (
      getMonitorHealth(maxMins) === 'offline' &&
      !isBranchMachineOffline(branch.branch_id, branchOnlineMap)
    )
  })
}

function buildBranchNumToStoreGroup(branches: Branch[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const b of branches) {
    const num = extractBranchNumForQueue(b.name)
    if (num) map.set(num, b.store_group_id)
    const norm = extractBranchNum(b.name)
    if (norm) map.set(norm, b.store_group_id)
  }
  return map
}

function resolveStoreGroupId(
  branchId: string | null | undefined,
  branchName: string,
  lookup: Map<string, string>
): string | undefined {
  const keys = new Set<string>()
  const id = branchId?.trim()
  if (id) {
    keys.add(id)
    const fromId = extractBranchNumForQueue(id)
    if (fromId) keys.add(fromId)
    const normId = extractBranchNum(id)
    if (normId) keys.add(normId)
  }
  const fromName = extractBranchNumForQueue(branchName)
  if (fromName) keys.add(fromName)
  const normName = extractBranchNum(branchName)
  if (normName) keys.add(normName)

  for (const key of keys) {
    const groupId = lookup.get(key)
    if (groupId) return groupId
  }
  return undefined
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
    const menuHeight = menu?.offsetHeight ?? (mode === 'resetstock' ? 180 : 80)
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
              onClick={() => setMode('resetstock')}
              className="w-full text-left px-3 py-2 hover:bg-pink-50 disabled:opacity-50"
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
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const hasLoadedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async (options?: { silent?: boolean; full?: boolean }) => {
    const silent = options?.silent ?? hasLoadedRef.current
    const full = options?.full ?? !hasLoadedRef.current

    if (!silent) {
      if (hasLoadedRef.current) setRefreshing(true)
      else setInitialLoading(true)
    }
    setError(null)
    try {
      const [latest, onlineMap] = await Promise.all([
        fetchLatestPrinterRecords(),
        full
          ? fetchBranchOnlineMap().catch(() => new Map<string, 'online' | 'offline'>())
          : Promise.resolve(null),
      ])
      setData(latest)
      if (onlineMap) setBranchOnlineMap(onlineMap)
      setLastRefresh(new Date())
      hasLoadedRef.current = true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }, [])

  const scheduleSilentRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      refresh({ silent: true })
    }, 3000)
  }, [refresh])

  useEffect(() => {
    refresh({ full: true })
  }, [refresh])

  useEffect(() => {
    const channel = supabase
      .channel('printer-dashboard')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'printer_log' },
        () => scheduleSilentRefresh()
      )
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [scheduleSilentRefresh])

  useEffect(() => {
    const tick = setInterval(() => setClockTick((n) => n + 1), 60_000)
    return () => clearInterval(tick)
  }, [])

  return {
    data,
    branchOnlineMap,
    loading: initialLoading,
    refreshing,
    error,
    lastRefresh,
    refresh,
    clockTick,
  }
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
  const { data, branchOnlineMap, loading, refreshing, error, lastRefresh, refresh, clockTick } =
    usePrinterStatus()
  const { storeGroups, branches, loading: branchLoading } = useBranches()
  const [search, setSearch] = useState('')
  const [filterGroupId, setFilterGroupId] = useState('')
  const [showProblemOnly, setShowProblemOnly] = useState(false)
  const [showMonitorOfflineOnly, setShowMonitorOfflineOnly] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const branchNumToStoreGroup = useMemo(
    () => buildBranchNumToStoreGroup(branches),
    [branches]
  )

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Group by branch — ซ่อนเครื่องที่ไม่ได้ report แล้ว (เช่น ลบออกจาก config)
  const activeBranchGroups = useMemo(() => groupByBranch(data), [data])

  const groupFilteredBranchGroups = useMemo(() => {
    if (!filterGroupId) return activeBranchGroups
    return activeBranchGroups.filter((printers) => {
      const branch = printers[0]
      return (
        resolveStoreGroupId(branch.branch_id, branch.branch_name, branchNumToStoreGroup) ===
        filterGroupId
      )
    })
  }, [activeBranchGroups, filterGroupId, branchNumToStoreGroup])

  const searchedBranchGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groupFilteredBranchGroups
    return groupFilteredBranchGroups.filter((printers) => {
      const branch = printers[0]
      return (
        branch.branch_name.toLowerCase().includes(q) ||
        branch.branch_id?.toLowerCase().includes(q) ||
        printers.some((p) => p.printer_name.toLowerCase().includes(q))
      )
    })
  }, [groupFilteredBranchGroups, search])

  const branchGroups = useMemo(() => {
    if (showProblemOnly) return filterProblemBranchGroups(searchedBranchGroups)
    if (showMonitorOfflineOnly) {
      return filterMonitorOfflineBranchGroups(searchedBranchGroups, branchOnlineMap)
    }
    return searchedBranchGroups
  }, [searchedBranchGroups, showProblemOnly, showMonitorOfflineOnly, branchOnlineMap])

  const scrollToList = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const toggleProblemFilter = useCallback(() => {
    setShowMonitorOfflineOnly(false)
    setShowProblemOnly((v) => {
      const next = !v
      if (next) scrollToList()
      return next
    })
  }, [scrollToList])

  const toggleMonitorOfflineFilter = useCallback(() => {
    setShowProblemOnly(false)
    setShowMonitorOfflineOnly((v) => {
      const next = !v
      if (next) scrollToList()
      return next
    })
  }, [scrollToList])

  // Summary counts (นับเฉพาะเครื่องที่ยัง active — ตามตัวกรองประเภทร้าน)
  const summary = useMemo(() => {
    const active = groupFilteredBranchGroups.flat()
    const total = active.length
    const normal = active.filter(isPrinterNormal).length
    const { problem, monitorOffline } = countPrinterAlertSummary(active)
    const machineOffline = new Set(
      active
        .filter((r) => isBranchMachineOffline(r.branch_id, branchOnlineMap))
        .map((r) => r.branch_id)
    ).size
    return { total, normal, problem, monitorOffline, machineOffline }
  }, [groupFilteredBranchGroups, branchOnlineMap, clockTick])

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
          onClick={() => refresh({ full: true })}
          disabled={loading || refreshing}
          className="flex items-center gap-1.5 text-sm text-pink-600 font-medium bg-pink-50 px-3 py-1.5 rounded-lg hover:bg-pink-100 disabled:opacity-50 flex-shrink-0"
        >
          <span className={refreshing ? 'animate-spin inline-block' : ''}>🔄</span>
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
          <button
            type="button"
            onClick={toggleProblemFilter}
            disabled={summary.problem === 0}
            title={
              summary.problem > 0
                ? showProblemOnly
                  ? 'แสดงรายการทั้งหมด'
                  : 'แสดงเฉพาะปริ้นเตอร์ที่มีปัญหา'
                : 'ไม่มีปริ้นเตอร์ที่มีปัญหา'
            }
            className={`rounded-xl p-3 text-center border transition-all active:scale-[0.98] ${
              summary.problem > 0
                ? showProblemOnly
                  ? 'bg-red-100 border-red-400 ring-2 ring-red-300 shadow-sm'
                  : 'bg-red-50 border-red-200 hover:bg-red-100 cursor-pointer'
                : 'bg-gray-50 border-gray-200 cursor-default opacity-60'
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
              {showProblemOnly && summary.problem > 0 && (
                <span className="block text-[10px] font-semibold mt-0.5">กำลังกรอง ✓</span>
              )}
            </p>
          </button>
          <button
            type="button"
            onClick={toggleMonitorOfflineFilter}
            disabled={summary.monitorOffline === 0}
            title={
              summary.monitorOffline > 0
                ? showMonitorOfflineOnly
                  ? 'แสดงรายการทั้งหมด'
                  : 'แสดงเฉพาะสาขาที่ Monitor ไม่ตอบ'
                : 'ไม่มี Monitor ที่ไม่ตอบ'
            }
            className={`rounded-xl p-3 text-center border transition-all active:scale-[0.98] ${
              summary.monitorOffline > 0
                ? showMonitorOfflineOnly
                  ? 'bg-orange-100 border-orange-400 ring-2 ring-orange-300 shadow-sm'
                  : 'bg-orange-50 border-orange-200 hover:bg-orange-100 cursor-pointer'
                : 'bg-gray-50 border-gray-200 cursor-default opacity-60'
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
              {showMonitorOfflineOnly && summary.monitorOffline > 0 && (
                <span className="block text-[10px] font-semibold mt-0.5">กำลังกรอง ✓</span>
              )}
            </p>
          </button>
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

      {/* Store group filter */}
      {activeBranchGroups.length > 0 && !branchLoading && storeGroups.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-500 mb-2 block">ประเภทร้าน</label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterGroupId('')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95
                ${!filterGroupId ? 'bg-pink-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              ทั้งหมด
            </button>
            {storeGroups.map((sg: StoreGroup) => (
              <button
                key={sg.id}
                type="button"
                onClick={() => setFilterGroupId(sg.id === filterGroupId ? '' : sg.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95
                  ${filterGroupId === sg.id ? 'bg-pink-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {sg.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Problem filter banner */}
      {showProblemOnly && summary.problem > 0 && (
        <div className="flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <p className="text-sm text-red-800">
            <span className="font-semibold">แสดงเฉพาะปริ้นเตอร์ที่มีปัญหา</span>
            <span className="text-red-600 ml-1">
              · {branchGroups.length} สาขา · {summary.problem} เครื่อง
            </span>
          </p>
          <button
            type="button"
            onClick={() => setShowProblemOnly(false)}
            className="text-xs font-semibold text-red-700 bg-white border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 flex-shrink-0"
          >
            แสดงทั้งหมด
          </button>
        </div>
      )}

      {/* Monitor offline filter banner */}
      {showMonitorOfflineOnly && summary.monitorOffline > 0 && (
        <div className="flex items-center justify-between gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5">
          <p className="text-sm text-orange-800">
            <span className="font-semibold">แสดงเฉพาะสาขาที่ Monitor ไม่ตอบ</span>
            <span className="text-orange-600 ml-1">
              · {branchGroups.length} สาขา · {summary.monitorOffline} เครื่อง
            </span>
          </p>
          <button
            type="button"
            onClick={() => setShowMonitorOfflineOnly(false)}
            className="text-xs font-semibold text-orange-700 bg-white border border-orange-200 px-2.5 py-1 rounded-lg hover:bg-orange-100 flex-shrink-0"
          >
            แสดงทั้งหมด
          </button>
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

      {/* No filter / search results */}
      {!loading &&
        branchGroups.length === 0 &&
        activeBranchGroups.length > 0 &&
        (search || filterGroupId || showProblemOnly || showMonitorOfflineOnly) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-3xl mb-2">
            {showProblemOnly ? '✅' : showMonitorOfflineOnly ? '📡' : search ? '🔍' : '🏪'}
          </p>
          <p className="text-gray-400 text-sm">
            {showProblemOnly
              ? search
                ? 'ไม่พบปริ้นเตอร์ที่มีปัญหาตามคำค้นหา'
                : filterGroupId
                ? `ไม่มีปริ้นเตอร์ที่มีปัญหาในประเภท ${storeGroups.find((g) => g.id === filterGroupId)?.name ?? ''}`
                : 'ไม่มีปริ้นเตอร์ที่มีปัญหาในขณะนี้'
              : showMonitorOfflineOnly
              ? search
                ? 'ไม่พบสาขาที่ Monitor ไม่ตอบตามคำค้นหา'
                : filterGroupId
                ? `ไม่มีสาขาที่ Monitor ไม่ตอบในประเภท ${storeGroups.find((g) => g.id === filterGroupId)?.name ?? ''}`
                : 'ไม่มีสาขาที่ Monitor ไม่ตอบในขณะนี้'
              : search
              ? 'ไม่พบสาขาที่ค้นหา'
              : `ไม่มีสาขาในประเภท ${storeGroups.find((g) => g.id === filterGroupId)?.name ?? ''}`}
          </p>
          {(showProblemOnly || showMonitorOfflineOnly) && (
            <button
              type="button"
              onClick={() => {
                setShowProblemOnly(false)
                setShowMonitorOfflineOnly(false)
              }}
              className="mt-3 text-xs font-semibold text-pink-600 hover:text-pink-700"
            >
              แสดงรายการทั้งหมด
            </button>
          )}
        </div>
      )}

      {/* Branch cards */}
      {!loading && branchGroups.length > 0 && (
        <div ref={listRef} className="space-y-3">
          {branchGroups.map((printers) => {
            const branch = printers[0]
            const groupName = storeGroups.find(
              (g) =>
                g.id ===
                resolveStoreGroupId(branch.branch_id, branch.branch_name, branchNumToStoreGroup)
            )?.name
            const maxMins = Math.max(...printers.map((p) => minutesSince(p.timestamp)))
            const monitorHealth = getMonitorHealth(maxMins)
            const machineOffline = isBranchMachineOffline(branch.branch_id, branchOnlineMap)
            const hasProblem = printers.some((p) => !isPrinterNormal(p))

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
                    {groupName && (
                      <span className="flex-shrink-0 text-xs font-bold bg-purple-600 text-white px-2 py-0.5 rounded">
                        {groupName}
                      </span>
                    )}
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
                    <span className="text-xs text-gray-400">
                      {showProblemOnly
                        ? `${printers.length} เครื่องมีปัญหา`
                        : `${printers.length} เครื่อง`}
                    </span>
                  </div>
                </div>

                {/* Printer rows */}
                <div className="divide-y divide-gray-50">
                  {sortPrinters(printers).map((p, printerIndex) => {
                    const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.error
                    const mins = minutesSince(p.timestamp)
                    const health = getMonitorHealth(mins)
                    const isNormal =
                      p.status === 'online' || p.status === 'printing'

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
                              {cfg.icon} {getPrinterDisplayLabel(p)}
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
                            {p.alert_msg &&
                              p.alert_msg.trim() !== getPrinterDisplayLabel(p) &&
                              (p.status_label?.trim() || p.alert_msg.length > 100) && (
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
