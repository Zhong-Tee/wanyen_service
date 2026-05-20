import { useState, useEffect, useMemo } from 'react'
import { useCategories } from '../hooks/useCategories'
import { useReport } from '../hooks/useCodes'
import { useStockReport } from '../hooks/useStockReport'
import { useBranches } from '../hooks/useBranches'
import { useSheetStatusReport } from '../hooks/useSheetStatusReport'
import type { BranchDetail, MachineStatusSummary } from '../hooks/useSheetStatusReport'
import { ZoomImage } from '../components/ZoomImage'
import { exportStockReportExcel } from '../lib/exportStockReport'

type ReportTab = 'codes' | 'stock' | 'machine'

export function Report() {
  const [activeTab, setActiveTab] = useState<ReportTab>('codes')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">รายงาน</h1>
        <p className="text-sm text-gray-500 mt-0.5">สรุปข้อมูลภาพรวม</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl">
        <button onClick={() => setActiveTab('codes')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all
            ${activeTab === 'codes' ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          🎟️ โค้ด
        </button>
        <button onClick={() => setActiveTab('stock')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all
            ${activeTab === 'stock' ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          📦 สินค้า
        </button>
        <button onClick={() => setActiveTab('machine')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all
            ${activeTab === 'machine' ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          🖥️ สถานะตู้
        </button>
      </div>

      {activeTab === 'codes'   && <CodesReport />}
      {activeTab === 'stock'   && <StockReport />}
      {activeTab === 'machine' && <MachineStatusReport />}
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
  { key: 'offline',     label: 'Offline',         icon: '📴', color: 'bg-red-50 border-red-200 text-red-700',       badgeColor: 'bg-red-500' },
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
              return (
                <button
                  key={cfg.key}
                  onClick={() => handleCardClick(cfg.key)}
                  className={`rounded-2xl border p-4 text-left transition-all active:scale-95 shadow-sm
                    ${cfg.color} ${isOpen ? 'ring-2 ring-pink-400 ring-offset-1' : 'hover:shadow-md'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl">{cfg.icon}</span>
                    <span className={`text-white text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badgeColor}`}>
                      {branches.length}
                    </span>
                  </div>
                  <p className="font-bold text-sm mt-2">{cfg.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">สาขา · {isOpen ? 'คลิกซ่อน' : 'คลิกดูรายละเอียด'}</p>
                </button>
              )
            })}
          </div>

          {/* Detail panel */}
          {expanded && (() => {
            const cfg = STATUS_CONFIGS.find((c) => c.key === expanded)!
            const branches = summary[expanded as keyof typeof summary] as BranchDetail[]
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
