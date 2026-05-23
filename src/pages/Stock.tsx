import { useState, useEffect, useMemo, useRef } from 'react'
import { useBranches } from '../hooks/useBranches'
import { useStock } from '../hooks/useStock'
import { useProducts } from '../hooks/useProducts'
import { useSheetSync } from '../hooks/useSheetSync'
import type { SyncUnmatched } from '../hooks/useSheetSync'
import { showToast } from '../components/Toast'
import type { StoreGroup, BranchStock, StockStatus } from '../types'

const STATUS_PRIORITY: Record<StockStatus, number> = { 'กำลังใช้': 0, 'เก็บ': 1, 'หมด': 2 }

const REASON_LABEL: Record<SyncUnmatched['reason'], string> = {
  no_branch: 'ไม่พบสาขา',
  no_product: 'ไม่พบสินค้า',
  no_active_stock: 'ไม่มีสต็อก กำลังใช้',
}

const REASON_COLOR: Record<SyncUnmatched['reason'], string> = {
  no_branch: 'bg-orange-100 text-orange-700',
  no_product: 'bg-yellow-100 text-yellow-700',
  no_active_stock: 'bg-blue-100 text-blue-600',
}

function formatRelativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'เมื่อกี้'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`
}

export function Stock() {
  const { storeGroups, activeBranches: branches, loading: branchLoading } = useBranches()
  const { products } = useProducts()
  const { stock, loading: stockLoading, fetchByBranch, setStatus, addProductToBranch } = useStock()
  const { syncing, syncError, result, sync } = useSheetSync()

  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [productSearch, setProductSearch] = useState<string>('')
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [addingProductId, setAddingProductId] = useState<string>('')
  const [addingQty, setAddingQty] = useState<string>('320')
  const [modalProductSearch, setModalProductSearch] = useState<string>('')
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showNotif, setShowNotif] = useState(false)
  const [notifFilter, setNotifFilter] = useState<SyncUnmatched['reason'] | 'all'>('all')
  const notifRef = useRef<HTMLDivElement>(null)

  const [branchSearch, setBranchSearch] = useState<string>('')
  const filteredBranches = useMemo(() =>
    branches
      .filter((b) => b.store_group_id === selectedGroup)
      .filter((b) => branchSearch.trim() === '' || b.name.toLowerCase().includes(branchSearch.toLowerCase())),
    [branches, selectedGroup, branchSearch]
  )

  const filteredStock = useMemo(() =>
    stock
      .filter((s) =>
        productSearch.trim() === '' || (s.product?.name ?? '').toLowerCase().includes(productSearch.toLowerCase())
      )
      .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]),
    [stock, productSearch]
  )

  useEffect(() => { setSelectedBranch(''); setBranchSearch('') }, [selectedGroup])
  useEffect(() => { if (selectedBranch) fetchByBranch(selectedBranch) }, [selectedBranch, fetchByBranch])

  // Refresh stock display after each sync
  const prevLastSync = useRef<Date | null>(null)
  useEffect(() => {
    if (result?.lastSync && result.lastSync !== prevLastSync.current) {
      prevLastSync.current = result.lastSync
      if (selectedBranch) fetchByBranch(selectedBranch)
    }
  }, [result?.lastSync, selectedBranch, fetchByBranch])

  // Close notification panel when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false)
      }
    }
    if (showNotif) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showNotif])

  const unmatchedItems = result?.unmatched ?? []
  const unmatchedCount = unmatchedItems.length
  const filteredUnmatched = unmatchedItems.filter(
    (u) => notifFilter === 'all' || u.reason === notifFilter
  )

  const handleSetStatus = async (item: BranchStock, newStatus: StockStatus, qty?: number) => {
    if (newStatus === 'หมด' && confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id)
      return
    }
    setConfirmDeleteId(null)
    const finalQty = qty !== undefined ? qty : item.quantity
    setUpdatingId(item.id)
    const { error } = await setStatus(item.id, newStatus, finalQty)
    setUpdatingId(null)
    if (error) {
      showToast(`เกิดข้อผิดพลาด: ${error}`, 'error')
    } else {
      if (newStatus === 'หมด') showToast('ลบสินค้าออกจาก Stock แล้ว', 'info')
      else showToast(`อัปเดตเป็น "${newStatus}" สำเร็จ`, 'success')
      fetchByBranch(selectedBranch)
    }
  }

  const handleAddProduct = async () => {
    if (!addingProductId || !selectedBranch) return
    const qty = Math.max(0, parseInt(addingQty) || 0)
    const { error } = await addProductToBranch(selectedBranch, addingProductId, qty)
    if (error) showToast(`เพิ่มสินค้าไม่ได้: ${error}`, 'error')
    else {
      showToast('เพิ่มสินค้าเข้า Stock แล้ว', 'success')
      setShowAddProduct(false); setAddingProductId(''); setAddingQty('320'); setModalProductSearch('')
      fetchByBranch(selectedBranch)
    }
  }

  const handleManualSync = async () => {
    await sync()
    if (selectedBranch) fetchByBranch(selectedBranch)
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Stock สินค้า</h1>
          <p className="text-sm text-gray-500 mt-0.5">จัดการสต็อกสินค้าแต่ละสาขา</p>
          {/* Sync status */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {syncing ? (
              <span className="text-xs text-blue-500 flex items-center gap-1">
                <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                กำลังซิงค์ Sheet...
              </span>
            ) : result?.lastSync ? (
              <span className="text-xs text-gray-400">
                ซิงค์แล้ว: {formatRelativeTime(result.lastSync)} · อัปเดต {result.updatedCount} รายการ
              </span>
            ) : syncError ? (
              <span className="text-xs text-red-400">ซิงค์ไม่ได้</span>
            ) : null}
            {!syncing && (
              <button
                onClick={handleManualSync}
                className="text-xs text-pink-500 hover:text-pink-700 font-medium underline underline-offset-2"
              >
                ซิงค์เดี๋ยวนี้
              </button>
            )}
          </div>
          {syncError && (
            <p className="text-xs text-red-500 mt-1">⚠️ {syncError}</p>
          )}
        </div>

        {/* Notification bell */}
        <div className="relative flex-shrink-0" ref={notifRef}>
          <button
            onClick={() => setShowNotif((v) => !v)}
            className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-sm border
              ${showNotif ? 'bg-pink-50 border-pink-200' : 'bg-white border-gray-200 hover:border-pink-200 hover:bg-pink-50'}`}
          >
            <span className="text-xl">🔔</span>
            {unmatchedCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none shadow">
                {unmatchedCount > 99 ? '99+' : unmatchedCount}
              </span>
            )}
          </button>

          {/* Notification panel */}
          {showNotif && (
            <div className="absolute right-0 top-14 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800 text-sm">การแจ้งเตือน Sync</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {unmatchedCount === 0 ? 'จับคู่สำเร็จทั้งหมด ✅' : `จับคู่ไม่ได้ ${unmatchedCount} รายการ`}
                  </p>
                </div>
                <button onClick={() => setShowNotif(false)} className="text-gray-400 hover:text-gray-600 text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
              </div>

              {/* Filter tabs — แสดงเฉพาะหมวดที่มีข้อมูล และมีมากกว่า 1 หมวด */}
              {unmatchedCount > 0 && (() => {
                const activeReasons = (['no_branch', 'no_product', 'no_active_stock'] as const).filter(
                  (r) => unmatchedItems.some((u) => u.reason === r)
                )
                if (activeReasons.length <= 1) return null
                return (
                  <div className="px-3 pt-3 flex gap-1.5 flex-wrap">
                    <button onClick={() => setNotifFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all
                        ${notifFilter === 'all' ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      ทั้งหมด ({unmatchedCount})
                    </button>
                    {activeReasons.map((r) => {
                      const count = unmatchedItems.filter((u) => u.reason === r).length
                      return (
                        <button key={r} onClick={() => setNotifFilter(r)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all
                            ${notifFilter === r ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {`${REASON_LABEL[r]} (${count})`}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Unmatched list */}
              <div className="max-h-72 overflow-y-auto px-3 pb-3 pt-2 space-y-1.5">
                {unmatchedCount === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-sm text-gray-400">ซิงค์สำเร็จทุกรายการ</p>
                  </div>
                ) : filteredUnmatched.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-4">ไม่มีรายการในหมวดนี้</p>
                ) : (
                  filteredUnmatched.map((u, i) => (
                    <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-xl p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">
                          {u.branchNum} · {u.productName}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">{u.branchName}</p>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-lg ${REASON_COLOR[u.reason]}`}>
                        {REASON_LABEL[u.reason]}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Diagnostic panel (แสดงเมื่ออัปเดต 0 รายการ) */}
              {result && result.updatedCount === 0 && !syncError && (
                <div className="mx-3 mb-2 bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-700">🔍 วิเคราะห์สาเหตุ (อัปเดต 0 รายการ)</p>
                  <div className="text-[11px] text-amber-700 space-y-1">
                    <p>📋 Rows จาก Sheet: <strong>{result.diag.sheetRowCount}</strong></p>
                    <p>📦 สต็อก กำลังใช้ ใน DB: <strong>{result.diag.activeStockCount}</strong></p>
                    <p>🏪 เลขสาขาใน Sheet: <strong>{result.diag.sheetBranchNums.slice(0, 5).join(', ')}{result.diag.sheetBranchNums.length > 5 ? '...' : ''}</strong></p>
                    <p>🏪 สาขาใน DB (เลข+ชื่อ): <strong>{result.diag.supabaseBranchNums.length === 0 ? 'ไม่มีชื่อสาขาขึ้นต้นด้วยตัวเลข ⚠️' : result.diag.supabaseBranchNums.slice(0, 3).join(', ')}</strong></p>
                    <p>🏷️ สินค้าใน DB: <strong>{result.diag.supabaseProducts.slice(0, 5).join(', ')}{result.diag.supabaseProducts.length > 5 ? '...' : ''}</strong></p>
                  </div>
                </div>
              )}

              {/* Sync error */}
              {syncError && (
                <div className="mx-3 mb-3 bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs text-red-600 font-medium">⚠️ {syncError}</p>
                  <p className="text-[11px] text-red-400 mt-1">
                    ตรวจสอบว่า Google Sheet ถูก Publish to web แล้ว (File → Share → Publish to web)
                  </p>
                </div>
              )}

              <div className="px-3 pb-3 space-y-2">
                <button
                  onClick={handleManualSync}
                  disabled={syncing}
                  className="w-full py-2.5 rounded-xl bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {syncing ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                      กำลังซิงค์...
                    </>
                  ) : '🔄 ซิงค์เดี๋ยวนี้'}
                </button>
                {result?.sheetDataDate && (
                  <p className="text-center text-[11px] text-gray-400">
                    ข้อมูล Sheet ณ วันที่ <span className="font-semibold text-gray-600">{result.sheetDataDate}</span> เวลา <span className="font-semibold text-gray-600">{result.sheetDataTime}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Branch selector */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">เลือกสาขา</h2>
        {branchLoading ? (
          <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
        ) : (
          <>
            {/* Store group buttons */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">ประเภทร้าน</label>
              <div className="flex gap-2 flex-wrap">
                {storeGroups.map((sg: StoreGroup) => (
                  <button key={sg.id} onClick={() => setSelectedGroup(sg.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95
                      ${selectedGroup === sg.id ? 'bg-pink-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {sg.name}
                  </button>
                ))}
                {storeGroups.length === 0 && <p className="text-sm text-gray-400 italic">ยังไม่มีประเภทร้าน</p>}
              </div>
            </div>

            {/* Branch search + dropdown */}
            {selectedGroup && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 block">สาขา</label>
                <div className="relative">
                  <input
                    type="text" value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)}
                    placeholder="ค้นหาชื่อสาขา..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                  {branchSearch && (
                    <button onClick={() => setBranchSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
                  )}
                </div>
                {filteredBranches.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">ไม่พบสาขา</p>
                ) : (
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
                  >
                    <option value="">— เลือกสาขา —</option>
                    {filteredBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Stock list */}
      {selectedBranch && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              รายการสินค้า ({filteredStock.length})
            </h2>
            <button onClick={() => setShowAddProduct(true)}
              className="flex items-center gap-1.5 bg-pink-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-pink-700 transition-colors active:scale-95">
              + เพิ่มสินค้า
            </button>
          </div>

          <div className="relative">
            <input
              type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            {productSearch && (
              <button onClick={() => setProductSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
            )}
          </div>

          {stockLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
          ) : filteredStock.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <p className="text-4xl mb-2">📦</p>
              <p className="text-gray-400 text-sm">{stock.length === 0 ? 'ยังไม่มีสินค้าในสาขานี้' : 'ไม่พบสินค้าที่ค้นหา'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredStock.map((item) => (
                <StockCard
                  key={item.id}
                  item={item}
                  updatingId={updatingId}
                  confirmDeleteId={confirmDeleteId}
                  quantityInputs={quantityInputs}
                  onSetStatus={handleSetStatus}
                  onQuantityChange={(id, val) => setQuantityInputs((prev) => ({ ...prev, [id]: val }))}
                  onZoomImage={setZoomImage}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Add product modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">เพิ่มสินค้าเข้า Stock</h3>
            <p className="text-xs text-gray-400">สามารถเพิ่มสินค้าซ้ำได้ แต่ละรายการจะแสดงแยกกัน</p>

            <div className="relative">
              <input
                type="text" value={modalProductSearch}
                onChange={(e) => setModalProductSearch(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
              {modalProductSearch && (
                <button onClick={() => setModalProductSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
              )}
            </div>

            {products.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีสินค้า — เพิ่มในเมนูตั้งค่า</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {products
                  .filter(p => modalProductSearch.trim() === '' || p.name.toLowerCase().includes(modalProductSearch.toLowerCase()))
                  .map((p) => (
                    <button key={p.id} onClick={() => setAddingProductId(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left
                        ${addingProductId === p.id ? 'border-pink-400 bg-pink-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400">📦</div>
                      )}
                      <span className="font-medium text-gray-800 text-sm">{p.name}</span>
                    </button>
                  ))
                }
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">จำนวน (แผ่น)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[50, 100, 200, 320, 500, 1500].map((qty) => (
                  <button
                    key={qty}
                    onClick={() => setAddingQty(String(qty))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95
                      ${addingQty === String(qty)
                        ? 'bg-pink-600 text-white border-pink-600'
                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-600'}`}>
                    {qty.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" value={addingQty}
                  onChange={(e) => setAddingQty(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 text-center"
                />
                <span className="text-sm text-gray-500 font-medium">แผ่น</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setShowAddProduct(false); setAddingProductId(''); setAddingQty('320'); setModalProductSearch('') }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">ยกเลิก</button>
              <button onClick={handleAddProduct} disabled={!addingProductId}
                className="flex-1 py-3 rounded-xl bg-pink-600 text-white font-bold disabled:opacity-50 hover:bg-pink-700 active:scale-95">เพิ่ม</button>
            </div>
          </div>
        </div>
      )}

      {/* Image zoom modal */}
      {zoomImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setZoomImage(null)}>
          <img src={zoomImage} alt="" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button onClick={() => setZoomImage(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-xl hover:bg-white/30">✕</button>
        </div>
      )}
    </div>
  )
}

interface StockCardProps {
  item: BranchStock
  updatingId: string | null
  confirmDeleteId: string | null
  quantityInputs: Record<string, string>
  onSetStatus: (item: BranchStock, status: StockStatus, qty?: number) => void
  onQuantityChange: (id: string, val: string) => void
  onZoomImage: (url: string) => void
  onCancelDelete: () => void
}

function StockCard({ item, updatingId, confirmDeleteId, quantityInputs, onSetStatus, onQuantityChange, onZoomImage, onCancelDelete }: StockCardProps) {
  const [showQtyInput, setShowQtyInput] = useState(false)
  const isUpdating = updatingId === item.id
  const awaitingConfirm = confirmDeleteId === item.id

  const getStatusColor = (s: StockStatus) => {
    if (s === 'กำลังใช้') return 'bg-green-100 text-green-700 border-green-200'
    if (s === 'เก็บ') return 'bg-blue-100 text-blue-700 border-blue-200'
    return 'bg-gray-100 text-gray-500'
  }

  const handleSaveQty = () => {
    const qty = parseInt(quantityInputs[item.id] ?? String(item.quantity))
    if (!isNaN(qty) && qty >= 0) onSetStatus(item, item.status, qty)
    setShowQtyInput(false)
  }

  const updatedDate = item.updated_at
    ? new Date(item.updated_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
    : null

  return (
    <div className={`bg-white rounded-2xl shadow-sm border p-4 transition-all ${awaitingConfirm ? 'border-red-300 bg-red-50/30' : 'border-gray-100'}`}>
      <div className="flex gap-4">
        <button onClick={() => item.product?.image_url && onZoomImage(item.product.image_url)}
          className={`flex-shrink-0 ${item.product?.image_url ? 'cursor-zoom-in' : 'cursor-default'}`}>
          {item.product?.image_url ? (
            <img src={item.product.image_url} alt={item.product?.name}
              className="w-20 h-20 rounded-xl object-cover hover:opacity-90 transition-opacity" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center">
              <span className="text-3xl">📦</span>
            </div>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">{item.product?.name ?? '—'}</p>
              <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full border ${getStatusColor(item.status)}`}>
                {item.status}
              </span>
            </div>
            <button
              onClick={() => { setShowQtyInput(true); onQuantityChange(item.id, String(item.quantity)) }}
              disabled={isUpdating}
              className="text-right flex-shrink-0 group hover:bg-pink-50 rounded-lg px-2 py-1 transition-colors disabled:opacity-50">
              <p className="text-xs text-gray-400">จำนวน(แผ่น)</p>
              <div className="flex items-center justify-end gap-1">
                <p className="font-bold text-gray-800">{item.quantity}</p>
                <span className="text-gray-300 group-hover:text-pink-400 text-xs transition-colors">✏️</span>
              </div>
            </button>
          </div>

          {updatedDate && (
            <p className="text-xs text-gray-400 mt-1">รับเข้า: {updatedDate}</p>
          )}

          {showQtyInput && (
            <div className="mt-2 flex gap-2 items-center">
              <input type="number" min="0"
                value={quantityInputs[item.id] ?? String(item.quantity)}
                onChange={(e) => onQuantityChange(item.id, e.target.value)}
                className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                placeholder="จำนวน" autoFocus />
              <button onClick={handleSaveQty} disabled={isUpdating}
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700">บันทึก</button>
              <button onClick={() => setShowQtyInput(false)}
                className="text-gray-400 px-2 py-1.5 text-xs hover:text-gray-600">ยกเลิก</button>
            </div>
          )}

          {awaitingConfirm && !showQtyInput && (
            <div className="mt-2 flex gap-2 items-center bg-red-50 rounded-xl p-2">
              <p className="text-xs text-red-600 font-medium flex-1">ยืนยันลบสินค้านี้ออกจาก Stock?</p>
              <button onClick={() => onSetStatus(item, 'หมด')} disabled={isUpdating}
                className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 active:scale-95">
                {isUpdating ? '...' : 'ยืนยัน'}
              </button>
              <button onClick={onCancelDelete}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">ยกเลิก</button>
            </div>
          )}

          {!showQtyInput && !awaitingConfirm && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              <button onClick={() => onSetStatus(item, 'กำลังใช้')} disabled={isUpdating || item.status === 'กำลังใช้'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 border
                  ${item.status === 'กำลังใช้' ? 'bg-green-100 text-green-700 border-green-200 cursor-default' : 'bg-green-50 text-green-600 hover:bg-green-100 border-green-200'}
                  disabled:opacity-50`}>
                {isUpdating ? '...' : '✅ กำลังใช้'}
              </button>
              <button onClick={() => onSetStatus(item, 'เก็บ')} disabled={isUpdating || item.status === 'เก็บ'}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 border
                  ${item.status === 'เก็บ' ? 'bg-blue-100 text-blue-700 border-blue-200 cursor-default' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200'}
                  disabled:opacity-50`}>
                {isUpdating ? '...' : '📦 เก็บ'}
              </button>
              <button onClick={() => onSetStatus(item, 'หมด')} disabled={isUpdating}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 transition-all active:scale-95 disabled:opacity-50">
                🚫 หมด
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
