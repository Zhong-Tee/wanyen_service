import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

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

// ── Branch Command Menu ───────────────────────────────────────────────────────

type Toast = { message: string; type: 'success' | 'error' }

interface BranchCommandMenuProps {
  branchId: string
  branchName: string
  printers: PrinterRecord[]
  onToast: (toast: Toast) => void
}

function BranchCommandMenu({ branchId, branchName, printers, onToast }: BranchCommandMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickPrinter, setPickPrinter] = useState<'testprint' | 'resetstock' | null>(null)
  const [resetStock, setResetStock] = useState('5000')
  const [sending, setSending] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => sortPrinters(printers), [printers])

  useEffect(() => {
    if (!menuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setPickPrinter(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  const closeAll = () => {
    setMenuOpen(false)
    setPickPrinter(null)
  }

  const sendTestPrint = async (printerIndex: number) => {
    setSending(true)
    try {
      await enqueuePrinterCommand(branchId, 'testprint', [printerIndex, 1])
      const name = sorted[printerIndex]?.printer_name ?? `เครื่อง ${printerIndex + 1}`
      onToast({
        message: `ส่ง Test Print สาขา ${branchId} · ${name} · 1 แผ่น`,
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

  const sendResetStock = async (printerIndex: number) => {
    const rows = parseInt(resetStock, 10)
    if (!rows || rows <= 0) {
      onToast({ message: 'กรุณาระบุจำนวนแถวที่ถูกต้อง', type: 'error' })
      return
    }
    setSending(true)
    try {
      await enqueuePrinterCommand(branchId, 'resetstock', [printerIndex, rows])
      const name = sorted[printerIndex]?.printer_name ?? `เครื่อง ${printerIndex + 1}`
      onToast({
        message: `ส่ง Reset Stock สาขา ${branchId} · ${name} · ${rows.toLocaleString()} แถว`,
        type: 'success',
      })
      closeAll()
      setResetStock('5000')
    } catch (e: unknown) {
      onToast({
        message: e instanceof Error ? e.message : 'ส่งคำสั่งไม่สำเร็จ',
        type: 'error',
      })
    } finally {
      setSending(false)
    }
  }

  const onTestPrintClick = () => {
    if (sorted.length === 1) {
      void sendTestPrint(0)
      return
    }
    setPickPrinter('testprint')
  }

  const onResetStockClick = () => {
    if (sorted.length === 1) {
      setPickPrinter('resetstock')
      return
    }
    setPickPrinter('resetstock')
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          setMenuOpen((v) => !v)
          setPickPrinter(null)
        }}
        disabled={sending}
        className="text-xs font-medium text-pink-700 bg-white border border-pink-200 px-2.5 py-1 rounded-lg hover:bg-pink-50 disabled:opacity-50 shadow-sm"
      >
        คำสั่ง
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-sm">
          {!pickPrinter ? (
            <>
              <button
                type="button"
                disabled={sending}
                onClick={onTestPrintClick}
                className="w-full text-left px-3 py-2 hover:bg-pink-50 disabled:opacity-50"
              >
                🖨️ Test Print
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={onResetStockClick}
                className="w-full text-left px-3 py-2 hover:bg-pink-50 disabled:opacity-50 border-t border-gray-100"
              >
                📦 Reset Stock
              </button>
            </>
          ) : pickPrinter === 'testprint' ? (
            <div className="px-2 py-2">
              <p className="text-xs text-gray-500 px-1 pb-2">เลือกเครื่อง (1 แผ่น)</p>
              {sorted.map((p, i) => (
                <button
                  key={p.printer_id}
                  type="button"
                  disabled={sending}
                  onClick={() => void sendTestPrint(i)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-pink-50 disabled:opacity-50 truncate"
                >
                  {i + 1}. {p.printer_name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPickPrinter(null)}
                className="w-full text-xs text-gray-400 mt-1 py-1 hover:text-gray-600"
              >
                ← กลับ
              </button>
            </div>
          ) : (
            <div className="px-3 py-2 space-y-2">
              <p className="text-xs text-gray-500">Reset Stock — {branchName}</p>
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
              {sorted.length > 1 ? (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400">เลือกเครื่อง</p>
                  {sorted.map((p, i) => (
                    <button
                      key={p.printer_id}
                      type="button"
                      disabled={sending}
                      onClick={() => void sendResetStock(i)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded-lg border border-gray-100 hover:bg-pink-50 disabled:opacity-50 truncate"
                    >
                      {i + 1}. {p.printer_name}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void sendResetStock(0)}
                  className="w-full text-xs font-medium text-white bg-pink-600 rounded-lg py-2 hover:bg-pink-700 disabled:opacity-50"
                >
                  ยืนยัน Reset Stock
                </button>
              )}
              <button
                type="button"
                onClick={() => setPickPrinter(null)}
                className="w-full text-xs text-gray-400 py-1 hover:text-gray-600"
              >
                ← กลับ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function usePrinterStatus() {
  const [data, setData] = useState<PrinterRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // ดึง records ล่าสุด (order by timestamp DESC) แล้ว deduplicate per printer_id
      // ใช้จำนวน 2000 รองรับ ~200 สาขา × 10 รอบ buffer ได้สบาย
      const { data: rows, error: err } = await supabase
        .from('printer_log')
        .select(
          'id, branch_id, branch_name, printer_id, printer_name, printer_ip, status, page_count, alert_msg, event, stock_remaining, timestamp'
        )
        .order('timestamp', { ascending: false })
        .limit(2000)
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
      setLastRefresh(new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, lastRefresh, refresh }
}

// ── Main Component ────────────────────────────────────────────────────────────

export function Printer() {
  const { data, loading, error, lastRefresh, refresh } = usePrinterStatus()
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Group by branch
  const branchGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? data.filter(
          (r) =>
            r.branch_name.toLowerCase().includes(q) ||
            r.printer_name.toLowerCase().includes(q) ||
            r.branch_id?.toLowerCase().includes(q)
        )
      : data

    const map = new Map<string, PrinterRecord[]>()
    filtered.forEach((r) => {
      const key = r.branch_id ?? r.branch_name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    return Array.from(map.values()).sort((a, b) =>
      a[0].branch_name.localeCompare(b[0].branch_name, 'th')
    )
  }, [data, search])

  // Summary counts
  const summary = useMemo(() => {
    const total = data.length
    const normal = data.filter((r) => r.status === 'online' || r.status === 'printing').length
    const problem = data.filter((r) => r.status !== 'online' && r.status !== 'printing').length
    const monitorOffline = data.filter(
      (r) => getMonitorHealth(minutesSince(r.timestamp)) === 'offline'
    ).length
    return { total, normal, problem, monitorOffline }
  }, [data])

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
      {!loading && data.length > 0 && (
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
      {data.length > 0 && (
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
      {!loading && search && branchGroups.length === 0 && data.length > 0 && (
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
            const hasProblem = printers.some(
              (p) => p.status !== 'online' && p.status !== 'printing'
            )

            return (
              <section
                key={branch.branch_id ?? branch.branch_name}
                className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
                  monitorHealth === 'offline'
                    ? 'border-orange-300'
                    : hasProblem
                    ? 'border-red-200'
                    : 'border-gray-100'
                }`}
              >
                {/* Branch header */}
                <div
                  className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${
                    monitorHealth === 'offline'
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
                    {branch.branch_id && (
                      <BranchCommandMenu
                        branchId={branch.branch_id}
                        branchName={branch.branch_name}
                        printers={printers}
                        onToast={setToast}
                      />
                    )}
                    {monitorHealth === 'offline' && (
                      <span className="text-xs font-bold text-orange-700 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-full">
                        📡 Monitor ไม่ตอบ
                      </span>
                    )}
                    {monitorHealth === 'warning' && (
                      <span className="text-xs font-bold text-yellow-700 bg-yellow-100 border border-yellow-300 px-2 py-0.5 rounded-full">
                        ⏱ ช้ากว่าปกติ
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{printers.length} เครื่อง</span>
                  </div>
                </div>

                {/* Printer rows */}
                <div className="divide-y divide-gray-50">
                  {printers.map((p) => {
                    const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.error
                    const mins = minutesSince(p.timestamp)
                    const health = getMonitorHealth(mins)
                    const isNormal = p.status === 'online' || p.status === 'printing'

                    return (
                      <div key={p.printer_id} className="px-4 py-3 flex items-center gap-3">
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
                                  p.stock_remaining <= 200 ? 'text-red-500' : 'text-gray-500'
                                }`}
                              >
                                📦 {p.stock_remaining.toLocaleString()} แถว
                                {p.stock_remaining <= 200 && ' ⚠️'}
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

                        {/* Timestamp */}
                        <div className="text-right flex-shrink-0">
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
