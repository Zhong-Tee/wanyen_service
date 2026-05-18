import { useState, useEffect, useMemo } from 'react'
import { useBranches } from '../hooks/useBranches'
import { useStock } from '../hooks/useStock'
import { useProducts } from '../hooks/useProducts'
import { showToast } from '../components/Toast'
import type { StoreGroup, BranchStock, StockStatus } from '../types'

export function Stock() {
  const { storeGroups, branches, loading: branchLoading } = useBranches()
  const { products } = useProducts()
  const { stock, loading: stockLoading, fetchByBranch, setStatus, addProductToBranch } = useStock()

  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [productSearch, setProductSearch] = useState<string>('')
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [addingProductId, setAddingProductId] = useState<string>('')
  const [addingQty, setAddingQty] = useState<string>('0')
  const [modalProductSearch, setModalProductSearch] = useState<string>('')
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [branchSearch, setBranchSearch] = useState<string>('')
  const filteredBranches = useMemo(() =>
    branches
      .filter((b) => b.store_group_id === selectedGroup)
      .filter((b) => branchSearch.trim() === '' || b.name.toLowerCase().includes(branchSearch.toLowerCase())),
    [branches, selectedGroup, branchSearch]
  )

  const filteredStock = useMemo(() =>
    stock.filter((s) =>
      productSearch.trim() === '' || (s.product?.name ?? '').toLowerCase().includes(productSearch.toLowerCase())
    ),
    [stock, productSearch]
  )

  useEffect(() => { setSelectedBranch(''); setBranchSearch('') }, [selectedGroup])
  useEffect(() => { if (selectedBranch) fetchByBranch(selectedBranch) }, [selectedBranch, fetchByBranch])

  const handleSetStatus = async (item: BranchStock, newStatus: StockStatus, qty?: number) => {
    if (newStatus === 'หมด' && confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id)
      return
    }
    setConfirmDeleteId(null)
    const finalQty = newStatus === 'เก็บ' ? (qty ?? parseInt(quantityInputs[item.id] ?? String(item.quantity))) : item.quantity
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
      setShowAddProduct(false); setAddingProductId(''); setAddingQty('0'); setModalProductSearch('')
      fetchByBranch(selectedBranch)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Stock สินค้า</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการสต็อกสินค้าแต่ละสาขา</p>
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

      {/* Add product modal — all products allowed (duplicates OK) */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">เพิ่มสินค้าเข้า Stock</h3>
            <p className="text-xs text-gray-400">สามารถเพิ่มสินค้าซ้ำได้ แต่ละรายการจะแสดงแยกกัน</p>

            {/* Product search in modal */}
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

            {/* Quantity input */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">จำนวน (แผ่น)</label>
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
              <button onClick={() => { setShowAddProduct(false); setAddingProductId(''); setAddingQty('0'); setModalProductSearch('') }}
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
    onSetStatus(item, 'เก็บ', parseInt(quantityInputs[item.id] ?? String(item.quantity)))
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
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400">จำนวน(แผ่น)</p>
              <p className="font-bold text-gray-800">{item.quantity}</p>
            </div>
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
              <button onClick={() => setShowQtyInput(true)} disabled={isUpdating}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 border
                  ${item.status === 'เก็บ' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200'}
                  disabled:opacity-50`}>
                📦 เก็บ
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
