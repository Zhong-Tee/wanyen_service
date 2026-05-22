import { useState, useEffect, useMemo } from 'react'
import { useCategories } from '../hooks/useCategories'
import { useReport } from '../hooks/useCodes'
import { useStockReport } from '../hooks/useStockReport'
import { useBranches } from '../hooks/useBranches'
import { useSheetStatusReport } from '../hooks/useSheetStatusReport'
import type { BranchDetail, MachineStatusSummary } from '../hooks/useSheetStatusReport'
import { ZoomImage } from '../components/ZoomImage'
import { exportStockReportExcel } from '../lib/exportStockReport'
import { useSalesReport } from '../hooks/useSalesReport'
import { useProfitReport } from '../hooks/useProfitReport'
import { useServiceReport } from '../hooks/useServiceReport'

type ReportTab = 'codes' | 'stock' | 'machine' | 'sales' | 'profit' | 'service'

const TAB_ROW1: { key: ReportTab; label: string; icon: string }[] = [
  { key: 'codes',   label: 'โค้ด',     icon: '🎟️' },
  { key: 'stock',   label: 'สินค้า',   icon: '📦' },
  { key: 'machine', label: 'สถานะตู้', icon: '🖥️' },
]

const TAB_ROW2: { key: ReportTab; label: string; icon: string }[] = [
  { key: 'sales',   label: 'ยอดขาย',       icon: '💰' },
  { key: 'profit',  label: 'กำไร/ขาดทุน',  icon: '📈' },
  { key: 'service', label: 'Service',       icon: '🔧' },
]

function TabButton({ tab, active, onClick }: { tab: { key: ReportTab; label: string; icon: string }; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold transition-all
        ${active ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
      {tab.icon} {tab.label}
    </button>
  )
}

export function Report() {
  const [activeTab, setActiveTab] = useState<ReportTab>('codes')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">รายงาน</h1>
        <p className="text-sm text-gray-500 mt-0.5">สรุปข้อมูลภาพรวม</p>
      </div>

      {/* Tab bar — แถวที่ 1 (เดิม) */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl">
        {TAB_ROW1.map((t) => (
          <TabButton key={t.key} tab={t} active={activeTab === t.key} onClick={() => setActiveTab(t.key)} />
        ))}
      </div>

      {/* Tab bar — แถวที่ 2 (ใหม่) */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl">
        {TAB_ROW2.map((t) => (
          <TabButton key={t.key} tab={t} active={activeTab === t.key} onClick={() => setActiveTab(t.key)} />
        ))}
      </div>

      {activeTab === 'codes'   && <CodesReport />}
      {activeTab === 'stock'   && <StockReport />}
      {activeTab === 'machine' && <MachineStatusReport />}
      {activeTab === 'sales'   && <SalesReport />}
      {activeTab === 'profit'  && <ProfitReport />}
      {activeTab === 'service' && <ServiceReport />}
    </div>
  )
}

// ── Machine Status Report ─────────────────────────────────────────────────────

const STATUS_CONFIGS: {
  key: keyof Pick<MachineStatusSummary, 'offline' | 'stockEmpty' | 'stockLow' | 'stockClosed' | 'inkEmpty' | 'notSync'>
  label: string
  icon: string
  color: string
  badgeColor: string
}[] = [
  { key: 'offline',     label: 'Online / Offline', icon: '📡', color: 'bg-red-50 border-red-200 text-red-700',       badgeColor: 'bg-red-500' },
  { key: 'stockEmpty',  label: 'สินค้าหมด',       icon: '🚫', color: 'bg-orange-50 border-orange-200 text-orange-700', badgeColor: 'bg-orange-500' },
  { key: 'stockLow',    label: 'สินค้าใกล้หมด',   icon: '⚠️', color: 'bg-yellow-50 border-yellow-200 text-yellow-700', badgeColor: 'bg-yellow-500' },
  { key: 'stockClosed', label: 'ปิดสินค้า',        icon: '🔒', color: 'bg-gray-50 border-gray-200 text-gray-700',     badgeColor: 'bg-gray-400' },
  { key: 'inkEmpty',    label: 'หมึกหมด',          icon: '🖨️', color: 'bg-purple-50 border-purple-200 text-purple-700', badgeColor: 'bg-purple-500' },
  { key: 'notSync',     label: 'Not Sync',         icon: '🔌', color: 'bg-blue-50 border-blue-200 text-blue-700',    badgeColor: 'bg-blue-500' },
]

function MachineStatusReport() {
  const { summary, loading, error, fetch } = useSheetStatusReport()
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { fetch() }, [fetch])

  const handleCardClick = (key: string) => {
    setExpanded((prev) => prev === key ? null : key)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {summary && (
            <p className="text-xs text-gray-400 mt-0.5">
              ข้อมูล ณ <span className="font-semibold text-gray-600">{summary.snapshotDate}</span> เวลา <span className="font-semibold text-gray-600">{summary.snapshotTime}</span>
              {' · '}{summary.totalBranches} สาขา
            </p>
          )}
        </div>
        <button onClick={fetch} disabled={loading}
          className="flex items-center gap-1.5 text-sm text-pink-600 font-medium bg-pink-50 px-3 py-1.5 rounded-lg hover:bg-pink-100 disabled:opacity-50">
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>รีเฟรช
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">⚠️ {error}</div>
      )}

      {/* Loading skeleton */}
      {loading && !summary && (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      )}

      {/* Status cards grid */}
      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {STATUS_CONFIGS.map((cfg) => {
              const branches = summary[cfg.key] as BranchDetail[]
              const isOpen = expanded === cfg.key
              const isOffline = cfg.key === 'offline'
              const onlineBranches = isOffline ? summary.online : null
              return (
                <button
                  key={cfg.key}
                  onClick={() => handleCardClick(cfg.key)}
                  className={`rounded-2xl border p-4 text-left transition-all active:scale-95 shadow-sm
                    ${cfg.color} ${isOpen ? 'ring-2 ring-pink-400 ring-offset-1' : 'hover:shadow-md'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl">{cfg.icon}</span>
                    {isOffline ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-white text-xs font-bold px-2 py-0.5 rounded-full bg-green-500">
                          {onlineBranches!.length}
                        </span>
                        <span className="text-white text-xs font-bold px-2 py-0.5 rounded-full bg-red-500">
                          {branches.length}
                        </span>
                      </div>
                    ) : (
                      <span className={`text-white text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badgeColor}`}>
                        {branches.length}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-sm mt-2">{cfg.label}</p>
                  {isOffline ? (
                    <p className="text-xs mt-0.5 opacity-70">
                      <span className="text-green-600 font-semibold">Online</span>
                      {' / '}
                      <span className="text-red-600 font-semibold">Offline</span>
                      {' · '}{isOpen ? 'คลิกซ่อน' : 'คลิกดูรายละเอียด'}
                    </p>
                  ) : (
                    <p className="text-xs opacity-70 mt-0.5">สาขา · {isOpen ? 'คลิกซ่อน' : 'คลิกดูรายละเอียด'}</p>
                  )}
                </button>
              )
            })}
          </div>

          {/* Detail panel */}
          {expanded && (() => {
            const cfg = STATUS_CONFIGS.find((c) => c.key === expanded)!
            const branches = summary[expanded as keyof typeof summary] as BranchDetail[]
            const isOffline = cfg.key === 'offline'
            const onlineBranches = isOffline ? summary.online : null

            const BranchList = ({ items, emptyIcon, emptyText, showProducts = true }: { items: BranchDetail[]; emptyIcon: string; emptyText: string; showProducts?: boolean }) =>
              items.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-3xl mb-2">{emptyIcon}</p>
                  <p className="text-xs text-gray-400">{emptyText}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {items.map((b) => (
                    <div key={b.branchNum} className="flex items-start gap-3 px-3 py-2.5">
                      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                        {b.branchNum}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 leading-snug">{b.branchName}</p>
                        {showProducts && b.products && b.products.length > 0 && (
                          <ol className="mt-1 space-y-0.5">
                            {b.products.map((p, i) => (
                              <li key={i} className="text-xs text-gray-500 flex gap-1 items-baseline">
                                <span className="flex-shrink-0 text-gray-400 w-3 text-right">{i + 1}.</span>
                                <span>{p}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )

            if (isOffline) {
              return (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-gray-50">
                    <p className="font-bold text-sm">📡 Online / Offline</p>
                    <button onClick={() => setExpanded(null)} className="text-lg opacity-60 hover:opacity-100">✕</button>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-gray-100">
                    {/* Left: Offline */}
                    <div>
                      <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">{branches.length}</span>
                        <span className="text-xs font-bold text-red-700">Offline</span>
                      </div>
                      <BranchList items={branches} emptyIcon="✅" emptyText="ไม่มีสาขา Offline" />
                    </div>
                    {/* Right: Online */}
                    <div>
                      <div className="px-3 py-2 bg-green-50 border-b border-green-100 flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-xs font-bold">{onlineBranches!.length}</span>
                        <span className="text-xs font-bold text-green-700">Online</span>
                      </div>
                      <BranchList items={onlineBranches!} emptyIcon="📴" emptyText="ไม่มีสาขา Online" />
                    </div>
                  </div>
                </section>
              )
            }

            return (
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className={`px-4 py-3 flex items-center justify-between border-b border-gray-100 ${cfg.color}`}>
                  <p className="font-bold text-sm">{cfg.icon} {cfg.label} — {branches.length} สาขา</p>
                  <button onClick={() => setExpanded(null)} className="text-lg opacity-60 hover:opacity-100">✕</button>
                </div>
                {branches.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-sm text-gray-400">ไม่มีสาขาในสถานะนี้</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                    {branches.map((b) => (
                      <div key={b.branchNum} className="flex items-start gap-3 px-4 py-3">
                        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                          {b.branchNum}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{b.branchName}</p>
                          {b.products && b.products.length > 0 && (
                            <ol className="mt-1.5 space-y-0.5">
                              {b.products.map((p, i) => (
                                <li key={i} className="text-xs text-gray-500 flex gap-1.5 items-baseline">
                                  <span className="flex-shrink-0 text-gray-400 w-4 text-right">{i + 1}.</span>
                                  <span>{p}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── Codes Report ──────────────────────────────────────────────────────────────

function CodesReport() {
  const { categories, loading: catLoading } = useCategories()
  const { items, loading: reportLoading, refetch } = useReport(categories)
  const loading = catLoading || reportLoading

  const grandTotal = items.reduce((s, i) => s + i.total, 0)
  const grandAvailable = items.reduce((s, i) => s + i.available, 0)
  const grandUsed = items.reduce((s, i) => s + i.used, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <button onClick={refetch} disabled={loading}
          className="flex items-center gap-1.5 text-sm text-pink-600 font-medium bg-pink-50 px-3 py-1.5 rounded-lg hover:bg-pink-100 disabled:opacity-50">
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>รีเฟรช
        </button>
      </div>

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="โค้ดทั้งหมด" value={grandTotal} color="pink" icon="🎟️" />
          <SummaryCard label="คงเหลือ" value={grandAvailable} color="green" icon="✅" />
          <SummaryCard label="ใช้แล้ว" value={grandUsed} color="gray" icon="✔️" />
        </div>
      )}

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">รายละเอียดแต่ละประเภท</h2>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-3 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-4xl mb-2">📊</p>
            <p className="text-sm">ยังไม่มีข้อมูล</p>
          </div>
        ) : (
          <div className="space-y-5">
            {items.map(({ category, total, available, used }) => {
              const usedPct = total > 0 ? Math.round((used / total) * 100) : 0
              const availPct = 100 - usedPct
              return (
                <div key={category.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-pink-100 text-pink-700 font-bold text-xs flex items-center justify-center">
                        {category.name.slice(0, 2)}
                      </span>
                      <span className="font-semibold text-gray-800">{category.name}</span>
                    </div>
                    <span className="text-xs text-gray-400 font-medium">{total} โค้ดทั้งหมด</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${availPct}%` }} />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1 text-pink-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-pink-500 inline-block" />คงเหลือ {available.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-gray-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />ใช้แล้ว {used.toLocaleString()}
                    </span>
                    {total > 0 && <span className="ml-auto text-gray-400">คงเหลือ {availPct}%</span>}
                  </div>
                  {available === 0 && total > 0 && <p className="text-xs text-red-500 font-medium">⚠️ โค้ดหมดแล้ว</p>}
                  {available > 0 && available <= 10 && <p className="text-xs text-yellow-600 font-medium">⚠️ โค้ดเหลือน้อย ({available} โค้ด)</p>}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Stock Report ──────────────────────────────────────────────────────────────

function StockReport() {
  const { data, loading, refresh } = useStockReport()
  const { storeGroups } = useBranches()
  const [filterGroupId, setFilterGroupId] = useState('')
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try { await exportStockReportExcel(data, storeGroups) }
    finally { setExporting(false) }
  }

  const filtered = useMemo(() => {
    return data.filter((s) => {
      if (filterGroupId && s.branch?.store_group_id !== filterGroupId) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const branchMatch = (s.branch?.name ?? '').toLowerCase().includes(q)
        const productMatch = (s.product?.name ?? '').toLowerCase().includes(q)
        const groupMatch = (s.branch?.store_group?.name ?? '').toLowerCase().includes(q)
        if (!branchMatch && !productMatch && !groupMatch) return false
      }
      return true
    })
  }, [data, filterGroupId, search])

  const byBranch = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    filtered.forEach((s) => {
      const key = s.branch_id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    })
    map.forEach((items, key) => {
      map.set(key, [...items].sort((a, b) =>
        (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'th')
      ))
    })
    return map
  }, [filtered])

  const totalItems = data.length
  const activeItems = data.filter((s) => s.status === 'กำลังใช้').length
  const storedItems = data.filter((s) => s.status === 'เก็บ').length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="รายการทั้งหมด" value={totalItems} color="pink" icon="📦" />
        <SummaryCard label="กำลังใช้" value={activeItems} color="green" icon="✅" />
        <SummaryCard label="เก็บสำรอง" value={storedItems} color="gray" icon="🗂️" />
      </div>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">กรองและค้นหา</span>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={loading}
              className="flex items-center gap-1 text-xs text-pink-600 font-medium bg-pink-50 px-2.5 py-1 rounded-lg hover:bg-pink-100 disabled:opacity-50">
              <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span> รีเฟรช
            </button>
            <button onClick={handleExport} disabled={exporting || loading || data.length === 0}
              className="flex items-center gap-1.5 text-xs text-white font-semibold bg-green-600 px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50 active:scale-95 transition-all">
              {exporting ? <span className="animate-spin inline-block">⏳</span> : '📥'}
              {exporting ? 'กำลังสร้าง...' : 'ดาวน์โหลด Excel'}
            </button>
          </div>
        </div>
        <div className="relative">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อร้าน, สาขา, สินค้า..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterGroupId('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
              ${!filterGroupId ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            ทั้งหมด
          </button>
          {storeGroups.map((sg) => (
            <button key={sg.id} onClick={() => setFilterGroupId(sg.id === filterGroupId ? '' : sg.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                ${filterGroupId === sg.id ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {sg.name}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : byBranch.size === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-4xl mb-2">📦</p>
          <p className="text-gray-400 text-sm">ไม่พบข้อมูลสินค้าคงเหลือ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(byBranch.entries()).map(([, items]) => {
            const branch = items[0].branch
            const groupName = branch?.store_group?.name ?? ''
            const totalQty = items.reduce((s, i) => s + (i.quantity ?? 0), 0)
            const activeQty = items.filter((i) => i.status === 'กำลังใช้').reduce((s, i) => s + (i.quantity ?? 0), 0)
            return (
              <section key={items[0].branch_id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {groupName && <span className="flex-shrink-0 text-xs font-bold bg-pink-600 text-white px-2 py-0.5 rounded">{groupName}</span>}
                      <span className="font-semibold text-gray-800 truncate">{branch?.name ?? '—'}</span>
                    </div>
                    <span className="flex-shrink-0 text-xs text-gray-400">{items.length} รายการ</span>
                  </div>
                  {/* จำนวนแผ่นรวม */}
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-xs text-gray-500">รวม <span className="font-bold text-gray-700">{totalQty.toLocaleString()}</span> แผ่น</span>
                    <span className="text-xs text-green-600">กำลังใช้ <span className="font-bold">{activeQty.toLocaleString()}</span> แผ่น</span>
                  </div>
                </div>

                <div className="divide-y divide-gray-50">
                  {items.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                      {s.product?.image_url ? (
                        <ZoomImage src={s.product.image_url} alt={s.product?.name}
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg">📦</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{s.product?.name ?? '—'}</p>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full
                          ${s.status === 'กำลังใช้' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {s.status}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">จำนวน(แผ่น)</p>
                        <p className={`font-bold ${s.quantity < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                          {s.quantity.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Sales Report ──────────────────────────────────────────────────────────────

function SalesReport() {
  const {
    dateFrom, setDateFrom, dateTo, setDateTo,
    compareMode, setCompareMode,
    dateFrom2, setDateFrom2, dateTo2, setDateTo2,
    data, data2, loading, error, fetch,
  } = useSalesReport()

  const [search, setSearch] = useState('')

  useEffect(() => { fetch() }, [fetch])

  const fmtBaht = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const filteredByBranch = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.byBranch
    return data.byBranch.filter((b) => b.branch_name.toLowerCase().includes(q))
  }, [data, search])

  const filteredTotal = useMemo(
    () => filteredByBranch.reduce((s, b) => s + b.total_sales, 0),
    [filteredByBranch]
  )
  const filteredQty = useMemo(
    () => filteredByBranch.reduce((s, b) => s + b.total_qty, 0),
    [filteredByBranch]
  )

  return (
    <div className="space-y-4">
      {/* Date range controls */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ช่วงเวลา</p>
        <div className="flex gap-2 items-center">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          <span className="text-gray-400 text-xs">—</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)}
            className="w-4 h-4 accent-pink-600" />
          เปรียบเทียบ 2 ช่วงเวลา
        </label>

        {compareMode && (
          <div className="flex gap-2 items-center">
            <input type="date" value={dateFrom2} onChange={(e) => setDateFrom2(e.target.value)}
              className="flex-1 border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <span className="text-gray-400 text-xs">—</span>
            <input type="date" value={dateTo2} onChange={(e) => setDateTo2(e.target.value)}
              className="flex-1 border border-blue-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        )}

        <button onClick={fetch} disabled={loading}
          className="w-full py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
          {loading ? 'กำลังโหลด...' : 'โหลดข้อมูล'}
        </button>
      </section>

      {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">⚠️ {error}</div>}

      {data && (
        <>
          {/* Summary cards */}
          {!compareMode ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-pink-50 border border-pink-100 rounded-xl p-3 text-center">
                <p className="text-xs text-pink-500">ยอดขายรวม</p>
                <p className="text-lg font-bold text-pink-700 mt-1">
                  ฿{fmtBaht(search ? filteredTotal : data.totalSales)}
                </p>
                <p className="text-xs text-pink-400 mt-0.5">{dateFrom} — {dateTo}</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                <p className="text-xs text-purple-500">จำนวนแผ่นรวม</p>
                <p className="text-lg font-bold text-purple-700 mt-1">
                  {(search ? filteredQty : data.totalQty).toLocaleString()}
                </p>
                <p className="text-xs text-purple-400 mt-0.5">แผ่น</p>
              </div>
            </div>
          ) : (
            <div className={`grid gap-3 ${data2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs text-gray-400 mb-1">ยอดขายรวม (ช่วงที่ 1)</p>
                <p className="text-xl font-bold text-pink-700">฿{fmtBaht(search ? filteredTotal : data.totalSales)}</p>
                <p className="text-xs text-purple-600 font-medium mt-0.5">{(search ? filteredQty : data.totalQty).toLocaleString()} แผ่น</p>
                <p className="text-xs text-gray-400 mt-0.5">{dateFrom} — {dateTo}</p>
              </section>
              {data2 && (
                <section className="bg-white rounded-2xl shadow-sm border border-blue-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">ยอดขายรวม (ช่วงที่ 2)</p>
                  <p className="text-xl font-bold text-blue-700">฿{fmtBaht(data2.totalSales)}</p>
                  <p className="text-xs text-blue-400 font-medium mt-0.5">{data2.totalQty.toLocaleString()} แผ่น</p>
                  <p className="text-xs text-gray-400 mt-0.5">{dateFrom2} — {dateTo2}</p>
                </section>
              )}
            </div>
          )}

          {/* ยอดขายแยกสาขา */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
              <p className="text-sm font-bold text-gray-700">ยอดขายแยกสาขา</p>
              <div className="relative">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อสาขา..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
                )}
              </div>
            </div>
            {filteredByBranch.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">📊</p>
                <p className="text-sm">{search ? 'ไม่พบสาขาที่ค้นหา' : 'ไม่มีข้อมูลในช่วงเวลาที่เลือก'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredByBranch.map((b) => {
                  const b2 = data2?.byBranch.find((x) => x.branch_name === b.branch_name)
                  const diffSales = b2 != null ? b.total_sales - b2.total_sales : null
                  const diffQty   = b2 != null ? b.total_qty   - b2.total_qty   : null
                  return (
                    <div key={b.branch_name} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{b.branch_name}</p>
                        <p className="text-xs text-purple-500 mt-0.5">{b.total_qty.toLocaleString()} แผ่น</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-pink-700">฿{fmtBaht(b.total_sales)}</p>
                        {compareMode && b2 != null && (
                          <>
                            <p className={`text-xs font-semibold ${diffSales! >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {diffSales! >= 0 ? '▲' : '▼'} ฿{fmtBaht(Math.abs(diffSales!))}
                            </p>
                            <p className={`text-xs ${diffQty! >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                              {diffQty! >= 0 ? '▲' : '▼'} {Math.abs(diffQty!).toLocaleString()} แผ่น
                            </p>
                          </>
                        )}
                        {compareMode && b2 == null && (
                          <p className="text-xs text-gray-300">ไม่มีข้อมูลช่วงที่ 2</p>
                        )}
                      </div>
                      {compareMode && data2 && (
                        <div className="text-right flex-shrink-0 w-24">
                          <p className="text-sm font-bold text-blue-600">฿{fmtBaht(b2?.total_sales ?? 0)}</p>
                          <p className="text-xs text-blue-400">{(b2?.total_qty ?? 0).toLocaleString()} แผ่น</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

// ── Profit / Loss Report ───────────────────────────────────────────────────────

function ProfitReport() {
  const {
    dateFrom, setDateFrom, dateTo, setDateTo,
    rows, loading, error, totalSales, totalCost, totalProfit,
    fetch,
  } = useProfitReport()

  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [search, setSearch] = useState('')

  useEffect(() => { fetch() }, [fetch])

  const sortedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? rows.filter((r) => r.branch_name.toLowerCase().includes(q)) : rows
    return [...filtered].sort((a, b) => sortOrder === 'desc' ? b.profit - a.profit : a.profit - b.profit)
  }, [rows, sortOrder, search])

  const filteredTotalSales = useMemo(() => sortedRows.reduce((s, r) => s + r.total_sales, 0), [sortedRows])
  const filteredTotalCost = useMemo(() => sortedRows.reduce((s, r) => s + r.cost_amount, 0), [sortedRows])
  const filteredTotalProfit = useMemo(() => sortedRows.reduce((s, r) => s + r.profit, 0), [sortedRows])

  const displayProfit = search ? filteredTotalProfit : totalProfit
  const isProfit = displayProfit >= 0

  const fmtBaht = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ช่วงเวลา</p>
        <div className="flex gap-2 items-center">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          <span className="text-gray-400 text-xs">—</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
        </div>
        <button onClick={fetch} disabled={loading}
          className="w-full py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
          {loading ? 'กำลังโหลด...' : 'โหลดข้อมูล'}
        </button>
      </section>

      {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">⚠️ {error}</div>}

      {rows.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-pink-50 border border-pink-100 rounded-xl p-3 text-center">
              <p className="text-xs text-pink-500">ยอดขายรวม</p>
              <p className="text-base font-bold text-pink-700 mt-1">฿{fmtBaht(search ? filteredTotalSales : totalSales)}</p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
              <p className="text-xs text-orange-500">ค่าใช้จ่ายรวม</p>
              <p className="text-base font-bold text-orange-600 mt-1">฿{fmtBaht(search ? filteredTotalCost : totalCost)}</p>
            </div>
            <div className={`rounded-xl p-3 text-center border ${isProfit ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`text-xs ${isProfit ? 'text-green-600' : 'text-red-500'}`}>กำไร/ขาดทุน</p>
              <p className={`text-base font-bold mt-1 ${isProfit ? 'text-green-700' : 'text-red-600'}`}>
                ฿{fmtBaht(displayProfit)}
              </p>
            </div>
          </div>

          {/* Table */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-700">กำไร/ขาดทุน แยกสาขา</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setSortOrder('desc')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all
                      ${sortOrder === 'desc' ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    มาก → น้อย
                  </button>
                  <button onClick={() => setSortOrder('asc')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all
                      ${sortOrder === 'asc' ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    น้อย → มาก
                  </button>
                </div>
              </div>
              <div className="relative">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อสาขา..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {sortedRows.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <p className="text-3xl mb-2">🔍</p>
                  <p className="text-sm">ไม่พบสาขาที่ค้นหา</p>
                </div>
              ) : sortedRows.map((r) => (
                <div key={r.branch_name} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">{r.branch_name}</p>
                    <span className={`text-sm font-bold ${r.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {r.profit >= 0 ? '+' : ''}฿{fmtBaht(r.profit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <div className="flex items-center gap-2">
                      <span>ยอดขาย: <span className="text-pink-600 font-medium">฿{fmtBaht(r.total_sales)}</span></span>
                      <span className="text-purple-400">{r.total_qty.toLocaleString()} แผ่น</span>
                    </div>
                    {r.cost_type === 'rent' && (
                      <span>ค่าเช่า: <span className="text-orange-500 font-medium">฿{fmtBaht(r.cost_amount)}</span></span>
                    )}
                    {r.cost_type === 'gp' && (
                      <span>GP {r.cost_value}%: <span className="text-orange-500 font-medium">฿{fmtBaht(r.cost_amount)}</span></span>
                    )}
                    {r.cost_type === 'none' && r.matched && (
                      <span className="text-gray-300">ยังไม่ได้ตั้งค่าเช่า/GP</span>
                    )}
                    {r.cost_type === 'none' && !r.matched && (
                      <span className="text-red-300">ไม่พบชื่อสาขาในระบบ</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-3xl mb-2">📈</p>
          <p className="text-gray-400 text-sm">กดโหลดข้อมูลเพื่อดูรายงาน</p>
          <p className="text-gray-300 text-xs mt-1">ตั้งค่าเช่า/GP ที่ ตั้งค่า → สาขา → แก้ไขสาขา</p>
        </div>
      )}
    </div>
  )
}

// ── Service Report ─────────────────────────────────────────────────────────────

function ServiceReport() {
  const { rows, loading, error, filterDays, setFilterDays, fetch } = useServiceReport()

  useEffect(() => { fetch() }, [fetch])

  const FILTER_OPTIONS = [
    { label: 'ทั้งหมด', value: null },
    { label: '≤ 3 วัน', value: 3 },
    { label: '≤ 7 วัน', value: 7 },
    { label: '≤ 14 วัน', value: 14 },
  ]

  const getDayColor = (days: number) => {
    if (days <= 3) return 'text-red-600 font-bold'
    if (days <= 7) return 'text-orange-500 font-bold'
    if (days <= 14) return 'text-yellow-600 font-semibold'
    return 'text-gray-600'
  }

  const getDayBadge = (days: number) => {
    if (days <= 3) return 'bg-red-50 border-red-200'
    if (days <= 7) return 'bg-orange-50 border-orange-200'
    if (days <= 14) return 'bg-yellow-50 border-yellow-200'
    return 'bg-gray-50 border-gray-200'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">คำนวณจากยอดขายเฉลี่ย 7 วัน vs สต๊อก "กำลังใช้"</p>
        <button onClick={fetch} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-pink-600 font-medium bg-pink-50 px-3 py-1.5 rounded-lg hover:bg-pink-100 disabled:opacity-50">
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>รีเฟรช
        </button>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button key={String(opt.value)} onClick={() => setFilterDays(opt.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
              ${filterDays === opt.value ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {opt.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-600">⚠️ {error}</div>}

      {loading && (
        <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-3xl mb-2">🔧</p>
          <p className="text-gray-400 text-sm">ไม่มีสาขาที่ต้องเข้า Service ในช่วงเวลานี้</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-700">รายชื่อสาขาที่ควรเข้า Service</p>
            <span className="text-xs text-gray-400">{rows.length} รายการ</span>
          </div>
          <div className="divide-y divide-gray-50">
            {rows.map((r, idx) => (
              <div key={`${r.branch_name}-${r.product_name}`}
                className={`flex items-center gap-3 px-4 py-3 ${getDayBadge(r.days_remaining)} border-l-4 ${r.days_remaining <= 3 ? 'border-l-red-400' : r.days_remaining <= 7 ? 'border-l-orange-400' : r.days_remaining <= 14 ? 'border-l-yellow-400' : 'border-l-transparent'}`}>
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{r.branch_name}</p>
                  <p className="text-xs text-gray-400 truncate">{r.product_name}</p>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-500">สต๊อก <span className="font-semibold text-gray-700">{r.quantity.toLocaleString()}</span> แผ่น</span>
                    {r.avg_daily_sales > 0 && (
                      <span className="text-xs text-blue-500">ยอดขายเฉลี่ย <span className="font-semibold">{r.avg_daily_sales % 1 === 0 ? r.avg_daily_sales.toFixed(0) : r.avg_daily_sales.toFixed(1)}</span> แผ่น</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-lg leading-none ${getDayColor(r.days_remaining)}`}>
                    {r.days_remaining === 9999 ? '—' : r.days_remaining}
                  </p>
                  <p className="text-xs text-gray-400">วัน</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Shared ─────────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, icon }: { label: string; value: number; color: 'pink' | 'green' | 'gray'; icon: string }) {
  const styles = { pink: 'bg-pink-50 border-pink-100 text-pink-700', green: 'bg-green-50 border-green-100 text-green-700', gray: 'bg-gray-50 border-gray-200 text-gray-600' }
  return (
    <div className={`rounded-xl border p-3 text-center ${styles[color]}`}>
      <p className="text-xl">{icon}</p>
      <p className="text-xl font-bold mt-1">{value.toLocaleString()}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
    </div>
  )
}
