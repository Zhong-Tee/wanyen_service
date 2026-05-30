import { useState, useRef, useMemo } from 'react'
import { useDeliveries } from '../hooks/useDeliveries'
import { useBranches } from '../hooks/useBranches'
import { useProducts } from '../hooks/useProducts'
import { showToast } from '../components/Toast'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { countDeliveriesByStatus, deliveryTabBadge } from '../lib/deliveryCounts'
import type { Delivery, DeliveryStatus, Product, Branch } from '../types'

const STATUS_ORDER: DeliveryStatus[] = ['ต้องจัดส่ง', 'จัดส่งแล้ว', 'ได้รับแล้ว']

const STATUS_STYLES: Record<DeliveryStatus, string> = {
  'ต้องจัดส่ง': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'จัดส่งแล้ว': 'bg-blue-100 text-blue-700 border-blue-200',
  'ได้รับแล้ว': 'bg-green-100 text-green-700 border-green-200',
}

const STATUS_NEXT: Record<DeliveryStatus, DeliveryStatus | null> = {
  'ต้องจัดส่ง': 'จัดส่งแล้ว',
  'จัดส่งแล้ว': 'ได้รับแล้ว',
  'ได้รับแล้ว': null,
}

interface DeliveryItemForm {
  product_id: string
  quantity: number | string
}

function filterProducts(products: Product[], search: string, includeIds: string[]) {
  const q = search.trim().toLowerCase()
  const keep = new Set(includeIds.filter(Boolean))
  return products.filter((p) => q === '' || p.name.toLowerCase().includes(q) || keep.has(p.id))
}

function BarcodeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M2 6h1v12H2V6zm3 0h1v12H5V6zm2 0h2v12H7V6zm3 0h1v12h-1V6zm2 0h3v12h-3V6zm4 0h1v12h-1V6zm2 0h2v12h-2V6zm3 0h1v12h-1V6z" />
    </svg>
  )
}

function TabCountBadge({ count, active }: { count: number; active: boolean }) {
  if (count <= 0) return null
  return (
    <span className={`min-w-[18px] h-[18px] text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none
      ${active ? 'bg-white text-pink-600' : 'bg-pink-600 text-white'}`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

interface DeliveryPageProps {
  onAction?: () => void
}

export function DeliveryPage({ onAction }: DeliveryPageProps) {
  const { deliveries, loading, createDelivery, updateStatus, updateTracking, updateToBranch, updateDeliveryItems, deleteDelivery } = useDeliveries()
  const { activeBranches: branches } = useBranches()
  const { products } = useProducts()

  const [showForm, setShowForm] = useState(false)
  const [toBranchId, setToBranchId] = useState('')
  const [formBranchSearch, setFormBranchSearch] = useState('')
  const [formProductSearch, setFormProductSearch] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<DeliveryItemForm[]>([{ product_id: '', quantity: 320 }])
  const [creating, setCreating] = useState(false)

  const [filterStatus, setFilterStatus] = useState<DeliveryStatus | 'all'>('ต้องจัดส่ง')
  const [branchSearch, setBranchSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [editTrackingId, setEditTrackingId] = useState<string | null>(null)
  const [trackingDraft, setTrackingDraft] = useState('')
  const trackingInputRef = useRef<HTMLInputElement>(null!)

  const [editItemsId, setEditItemsId] = useState<string | null>(null)
  const [editItemsDraft, setEditItemsDraft] = useState<DeliveryItemForm[]>([])
  const [editProductSearch, setEditProductSearch] = useState('')
  const [savingItemsId, setSavingItemsId] = useState<string | null>(null)

  const [editBranchId, setEditBranchId] = useState<string | null>(null)
  const [branchDraft, setBranchDraft] = useState('')
  const [editBranchSearch, setEditBranchSearch] = useState('')
  const [savingBranchId, setSavingBranchId] = useState<string | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Barcode scanner for create form
  const [showScanner, setShowScanner] = useState(false)
  // Barcode scanner for tracking edit
  const [showTrackingScanner, setShowTrackingScanner] = useState<string | null>(null)

  const addItem = () => setItems((prev) => [...prev, { product_id: '', quantity: 320 }])
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))
  const updateItem = (idx: number, field: keyof DeliveryItemForm, value: string | number) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!toBranchId) { showToast('กรุณาเลือกสาขาปลายทาง', 'warning'); return }
    const parsedItems = items.map((i) => ({ ...i, quantity: Number(i.quantity) || 0 }))
    const validItems = parsedItems.filter((i) => i.product_id && i.quantity > 0)
    if (validItems.length === 0) { showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning'); return }
    setCreating(true)
    const { error } = await createDelivery({ to_branch_id: toBranchId, tracking_number: trackingNumber, notes, items: validItems })
    setCreating(false)
    if (error) showToast(`สร้างรายการไม่ได้: ${error}`, 'error')
    else {
      showToast('สร้างรายการจัดส่งสำเร็จ', 'success')
      setToBranchId(''); setTrackingNumber(''); setNotes(''); setItems([{ product_id: '', quantity: 320 }]); setFormBranchSearch(''); setFormProductSearch(''); setShowForm(false)
    }
  }

  const handleNextStatus = async (delivery: Delivery) => {
    const next = STATUS_NEXT[delivery.status]
    if (!next) return
    setUpdatingId(delivery.id)
    const { error } = await updateStatus(delivery.id, next)
    setUpdatingId(null)
    if (error) showToast(`เกิดข้อผิดพลาด: ${error}`, 'error')
    else {
      if (next === 'ได้รับแล้ว') showToast('รับสินค้าเข้า Stock อัตโนมัติแล้ว ✅', 'success')
      else showToast(`อัปเดตสถานะเป็น "${next}" แล้ว`, 'success')
      onAction?.()
    }
  }

  const handleSaveTracking = async (id: string) => {
    const { error } = await updateTracking(id, trackingDraft)
    if (error) showToast(`บันทึกไม่ได้: ${error}`, 'error')
    else { showToast('บันทึกเลขพัสดุแล้ว', 'success'); setEditTrackingId(null) }
  }

  const openTrackingEdit = (delivery: Delivery) => {
    setEditTrackingId(delivery.id)
    setTrackingDraft(delivery.tracking_number ?? '')
    setTimeout(() => trackingInputRef.current?.focus(), 50)
  }

  const openItemsEdit = (delivery: Delivery) => {
    setEditItemsId(delivery.id)
    setEditProductSearch('')
    setEditItemsDraft(
      delivery.items?.length
        ? delivery.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }))
        : [{ product_id: '', quantity: 320 }],
    )
  }

  const updateEditItem = (idx: number, field: keyof DeliveryItemForm, value: string | number) => {
    setEditItemsDraft((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const handleSaveItems = async (deliveryId: string) => {
    const parsedItems = editItemsDraft.map((i) => ({ ...i, quantity: Number(i.quantity) || 0 }))
    const validItems = parsedItems.filter((i) => i.product_id && i.quantity > 0)
    if (validItems.length === 0) { showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'warning'); return }
    setSavingItemsId(deliveryId)
    const { error } = await updateDeliveryItems(deliveryId, validItems)
    setSavingItemsId(null)
    if (error) showToast(`บันทึกไม่ได้: ${error}`, 'error')
    else { showToast('บันทึกรายการสินค้าแล้ว', 'success'); setEditItemsId(null) }
  }

  const openBranchEdit = (delivery: Delivery) => {
    setEditBranchId(delivery.id)
    setBranchDraft(delivery.to_branch_id)
    setEditBranchSearch('')
  }

  const handleSaveBranch = async (deliveryId: string) => {
    if (!branchDraft) { showToast('กรุณาเลือกสาขาปลายทาง', 'warning'); return }
    setSavingBranchId(deliveryId)
    const { error } = await updateToBranch(deliveryId, branchDraft)
    setSavingBranchId(null)
    if (error) showToast(`บันทึกไม่ได้: ${error}`, 'error')
    else { showToast('บันทึกสาขาปลายทางแล้ว', 'success'); setEditBranchId(null) }
  }

  const handleDelete = async (delivery: Delivery) => {
    if (confirmDeleteId !== delivery.id) { setConfirmDeleteId(delivery.id); return }
    setDeletingId(delivery.id)
    setConfirmDeleteId(null)
    const { error } = await deleteDelivery(delivery.id)
    setDeletingId(null)
    if (error) showToast(`ลบไม่ได้: ${error}`, 'error')
    else { showToast('ลบรายการจัดส่งแล้ว', 'info'); onAction?.() }
  }

  const selectedProductIds = useMemo(
    () => items.map((i) => i.product_id).filter(Boolean),
    [items],
  )

  const statusCounts = useMemo(() => countDeliveriesByStatus(deliveries), [deliveries])

  const filtered = useMemo(() => {
    let list = filterStatus === 'all' ? deliveries : deliveries.filter((d) => d.status === filterStatus)
    if (branchSearch.trim()) {
      const q = branchSearch.toLowerCase()
      list = list.filter((d) => {
        const branchName = (d.branch?.name ?? '').toLowerCase()
        const groupName = (d.branch?.store_group?.name ?? '').toLowerCase()
        return branchName.includes(q) || groupName.includes(q)
      })
    }
    return list
  }, [deliveries, filterStatus, branchSearch])

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">จัดส่ง</h1>
          <p className="text-sm text-gray-500 mt-0.5">ติดตามการจัดส่งสินค้า</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-pink-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-pink-700 transition-colors active:scale-95">
          {showForm ? '✕ ปิด' : '+ สร้างรายการ'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <section className="bg-white rounded-2xl shadow-sm border border-pink-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-pink-700">สร้างรายการจัดส่งใหม่</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 block">สาขาปลายทาง *</label>
              <div className="relative">
                <input
                  type="text" value={formBranchSearch} onChange={(e) => setFormBranchSearch(e.target.value)}
                  placeholder="ค้นหาชื่อสาขา..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
                {formBranchSearch && (
                  <button onClick={() => setFormBranchSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
                )}
              </div>
              <select value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white" required>
                <option value="">— เลือกสาขา —</option>
                {branches
                  .filter((b) => formBranchSearch.trim() === '' ||
                    b.name.toLowerCase().includes(formBranchSearch.toLowerCase()) ||
                    (b.store_group?.name ?? '').toLowerCase().includes(formBranchSearch.toLowerCase()))
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.store_group?.name ? `${b.store_group.name} · ` : ''}{b.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Tracking with barcode scan */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">เลขพัสดุ</label>
              <div className="flex gap-2">
                <input
                  type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="พิมพ์หรือสแกนบาร์โค้ด"
                  inputMode="numeric" autoComplete="off"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
                <button type="button" onClick={() => setShowScanner(true)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-pink-100 text-pink-700 hover:bg-pink-200 transition-colors flex-shrink-0">
                  <BarcodeIcon className="w-6 h-6" />
                </button>
              </div>
            </div>

              <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 block">รายการสินค้า *</label>
              <div className="relative">
                <input
                  type="text" value={formProductSearch} onChange={(e) => setFormProductSearch(e.target.value)}
                  placeholder="ค้นหาชื่อสินค้า..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
                {formProductSearch && (
                  <button onClick={() => setFormProductSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
                )}
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white">
                    <option value="">— เลือกสินค้า —</option>
                    {filterProducts(products, formProductSearch, selectedProductIds)
                      .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min="0" value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-pink-400" />
                  <span className="text-xs text-gray-500 flex-shrink-0">แผ่น</span>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex-shrink-0 text-sm">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addItem}
                className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-sm hover:border-pink-300 hover:text-pink-500">
                + เพิ่มสินค้า
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">หมายเหตุ</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none" />
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50">ยกเลิก</button>
              <button type="submit" disabled={creating}
                className="flex-1 py-2.5 rounded-xl bg-pink-600 text-white font-bold text-sm disabled:opacity-50 hover:bg-pink-700 active:scale-95">
                {creating ? 'กำลังสร้าง...' : '🚚 สร้างรายการ'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Barcode scanner for create form */}
      {showScanner && (
        <BarcodeScanner
          onDetected={(val) => { setTrackingNumber(val); setShowScanner(false); showToast(`สแกนได้: ${val}`, 'success') }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Barcode scanner for tracking edit */}
      {showTrackingScanner && (
        <BarcodeScanner
          onDetected={(val) => { setTrackingDraft(val); setShowTrackingScanner(null); showToast(`สแกนได้: ${val}`, 'success') }}
          onClose={() => setShowTrackingScanner(null)}
        />
      )}

      {/* Filter bar */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', ...STATUS_ORDER] as const).map((s) => {
            const active = filterStatus === s
            const badge = s === 'all' ? 0 : deliveryTabBadge(s, statusCounts)
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all
                  ${active ? 'bg-pink-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                <span>{s === 'all' ? 'ทั้งหมด' : s}</span>
                <TabCountBadge count={badge} active={active} />
              </button>
            )
          })}
        </div>
        <div className="relative">
          <input
            type="text" value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)}
            placeholder="ค้นหาสาขา..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
          {branchSearch && (
            <button onClick={() => setBranchSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
          )}
        </div>
      </div>

      {/* Delivery list */}
      {loading ? (
        <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-4xl mb-2">🚚</p>
          <p className="text-gray-400 text-sm">ไม่มีรายการจัดส่ง</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <DeliveryCard
              key={d.id}
              delivery={d}
              branches={branches}
              products={products}
              updatingId={updatingId}
              editTrackingId={editTrackingId}
              trackingDraft={trackingDraft}
              trackingInputRef={trackingInputRef}
              editItemsId={editItemsId}
              editItemsDraft={editItemsDraft}
              editProductSearch={editProductSearch}
              savingItemsId={savingItemsId}
              editBranchId={editBranchId}
              branchDraft={branchDraft}
              editBranchSearch={editBranchSearch}
              savingBranchId={savingBranchId}
              confirmDeleteId={confirmDeleteId}
              deletingId={deletingId}
              onNextStatus={handleNextStatus}
              onOpenTracking={openTrackingEdit}
              onSaveTracking={handleSaveTracking}
              onTrackingChange={setTrackingDraft}
              onCancelTracking={() => setEditTrackingId(null)}
              onScanTracking={(id) => { setShowTrackingScanner(id); setEditTrackingId(id) }}
              onOpenItemsEdit={openItemsEdit}
              onSaveItems={handleSaveItems}
              onCancelItemsEdit={() => setEditItemsId(null)}
              onEditItemsChange={setEditItemsDraft}
              onEditProductSearchChange={setEditProductSearch}
              onUpdateEditItem={updateEditItem}
              onOpenBranchEdit={openBranchEdit}
              onSaveBranch={handleSaveBranch}
              onCancelBranchEdit={() => setEditBranchId(null)}
              onBranchDraftChange={setBranchDraft}
              onEditBranchSearchChange={setEditBranchSearch}
              onDelete={handleDelete}
              statusStyles={STATUS_STYLES}
              nextStatus={STATUS_NEXT}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface DeliveryCardProps {
  delivery: Delivery
  branches: Branch[]
  products: Product[]
  updatingId: string | null
  editTrackingId: string | null
  trackingDraft: string
  trackingInputRef: React.RefObject<HTMLInputElement>
  editItemsId: string | null
  editItemsDraft: DeliveryItemForm[]
  editProductSearch: string
  savingItemsId: string | null
  editBranchId: string | null
  branchDraft: string
  editBranchSearch: string
  savingBranchId: string | null
  confirmDeleteId: string | null
  deletingId: string | null
  onNextStatus: (d: Delivery) => void
  onOpenTracking: (d: Delivery) => void
  onSaveTracking: (id: string) => void
  onTrackingChange: (v: string) => void
  onCancelTracking: () => void
  onScanTracking: (id: string) => void
  onOpenItemsEdit: (d: Delivery) => void
  onSaveItems: (id: string) => void
  onCancelItemsEdit: () => void
  onEditItemsChange: (items: DeliveryItemForm[]) => void
  onEditProductSearchChange: (v: string) => void
  onUpdateEditItem: (idx: number, field: keyof DeliveryItemForm, value: string | number) => void
  onOpenBranchEdit: (d: Delivery) => void
  onSaveBranch: (id: string) => void
  onCancelBranchEdit: () => void
  onBranchDraftChange: (v: string) => void
  onEditBranchSearchChange: (v: string) => void
  onDelete: (d: Delivery) => void
  statusStyles: Record<DeliveryStatus, string>
  nextStatus: Record<DeliveryStatus, DeliveryStatus | null>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function DeliveryCard({
  delivery: d, branches, products, updatingId, editTrackingId, trackingDraft, trackingInputRef,
  editItemsId, editItemsDraft, editProductSearch, savingItemsId,
  editBranchId, branchDraft, editBranchSearch, savingBranchId,
  confirmDeleteId, deletingId,
  onNextStatus, onOpenTracking, onSaveTracking, onTrackingChange, onCancelTracking, onScanTracking,
  onOpenItemsEdit, onSaveItems, onCancelItemsEdit, onEditItemsChange, onEditProductSearchChange, onUpdateEditItem,
  onOpenBranchEdit, onSaveBranch, onCancelBranchEdit, onBranchDraftChange, onEditBranchSearchChange, onDelete,
  statusStyles, nextStatus,
}: DeliveryCardProps) {
  const next = nextStatus[d.status]
  const isUpdating = updatingId === d.id
  const isEditingTracking = editTrackingId === d.id
  const isEditingItems = editItemsId === d.id
  const isSavingItems = savingItemsId === d.id
  const isEditingBranch = editBranchId === d.id
  const isSavingBranch = savingBranchId === d.id
  const isDeleting = deletingId === d.id
  const canEdit = d.status !== 'ได้รับแล้ว'
  const editSelectedProductIds = editItemsDraft.map((i) => i.product_id).filter(Boolean)

  const filteredBranches = branches.filter((b) =>
    editBranchSearch.trim() === '' ||
    b.name.toLowerCase().includes(editBranchSearch.toLowerCase()) ||
    (b.store_group?.name ?? '').toLowerCase().includes(editBranchSearch.toLowerCase()),
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusStyles[d.status]}`}>
              {d.status}
            </span>
          </div>
          {isEditingBranch ? (
            <div className="mt-2 space-y-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
              <span className="text-xs font-semibold text-gray-600">แก้ไขสาขาปลายทาง</span>
              <div className="relative">
                <input
                  type="text" value={editBranchSearch} onChange={(e) => onEditBranchSearchChange(e.target.value)}
                  placeholder="ค้นหาชื่อสาขา..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
                />
                {editBranchSearch && (
                  <button onClick={() => onEditBranchSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
                )}
              </div>
              <select value={branchDraft} onChange={(e) => onBranchDraftChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white">
                <option value="">— เลือกสาขา —</option>
                {filteredBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.store_group?.name ? `${b.store_group.name} · ` : ''}{b.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 pt-1">
                <button onClick={() => onSaveBranch(d.id)} disabled={isSavingBranch}
                  className="flex-1 py-2 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 disabled:opacity-50">
                  {isSavingBranch ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button onClick={onCancelBranchEdit}
                  className="px-4 py-2 text-gray-400 text-xs border border-gray-200 rounded-xl hover:bg-gray-50 bg-white">ยกเลิก</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <p className="font-semibold text-gray-800">
                → {d.branch?.store_group ? `${d.branch.store_group.name} · ` : ''}{d.branch?.name ?? '—'}
              </p>
              {canEdit && (
                <button onClick={() => onOpenBranchEdit(d)}
                  className="text-xs text-pink-600 hover:text-pink-700 font-medium flex-shrink-0">
                  ✏️
                </button>
              )}
            </div>
          )}
          {/* Date timeline */}
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span>📋</span>
              <span>สร้าง:</span>
              <span>{formatDate(d.created_at)}</span>
            </div>
            {d.shipped_at && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
                <span>🚚</span>
                <span>วันที่ส่ง:</span>
                <span>{formatDate(d.shipped_at)}</span>
              </div>
            )}
            {d.received_at && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                <span>✅</span>
                <span>วันที่รับ:</span>
                <span>{formatDate(d.received_at)}</span>
              </div>
            )}
          </div>
        </div>
        {canEdit && (
          <button onClick={() => onDelete(d)} disabled={isDeleting}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0
              ${confirmDeleteId === d.id ? 'bg-red-500 text-white animate-pulse' : 'bg-red-50 text-red-400 hover:bg-red-100'}`}>
            {isDeleting ? '...' : confirmDeleteId === d.id ? 'ยืนยัน?' : 'ลบ'}
          </button>
        )}
      </div>

      {isEditingItems ? (
        <div className="space-y-2 bg-gray-50 rounded-xl p-3 border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">แก้ไขรายการสินค้า</span>
          </div>
          <div className="relative">
            <input
              type="text" value={editProductSearch} onChange={(e) => onEditProductSearchChange(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
            />
            {editProductSearch && (
              <button onClick={() => onEditProductSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
            )}
          </div>
          {editItemsDraft.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <select value={item.product_id} onChange={(e) => onUpdateEditItem(idx, 'product_id', e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white">
                <option value="">— เลือกสินค้า —</option>
                {filterProducts(products, editProductSearch, editSelectedProductIds)
                  .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" min="0" value={item.quantity}
                onChange={(e) => onUpdateEditItem(idx, 'quantity', e.target.value === '' ? '' : parseInt(e.target.value))}
                className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white" />
              <span className="text-xs text-gray-500 flex-shrink-0">แผ่น</span>
              {editItemsDraft.length > 1 && (
                <button type="button" onClick={() => onEditItemsChange(editItemsDraft.filter((_, i) => i !== idx))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 flex-shrink-0 text-sm">✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => onEditItemsChange([...editItemsDraft, { product_id: '', quantity: 320 }])}
            className="w-full py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-sm hover:border-pink-300 hover:text-pink-500 bg-white">
            + เพิ่มสินค้า
          </button>
          <div className="flex gap-2 pt-1">
            <button onClick={() => onSaveItems(d.id)} disabled={isSavingItems}
              className="flex-1 py-2 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700 disabled:opacity-50">
              {isSavingItems ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button onClick={onCancelItemsEdit}
              className="px-4 py-2 text-gray-400 text-xs border border-gray-200 rounded-xl hover:bg-gray-50 bg-white">ยกเลิก</button>
          </div>
        </div>
      ) : d.items && d.items.length > 0 ? (
        <div className="space-y-1">
          {canEdit && (
            <div className="flex justify-end">
              <button onClick={() => onOpenItemsEdit(d)}
                className="text-xs text-pink-600 hover:text-pink-700 font-medium">
                ✏️ แก้ไขรายการ
              </button>
            </div>
          )}
          {d.items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              {item.product?.image_url && (
                <img src={item.product.image_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
              )}
              <span className="text-gray-700 flex-1 min-w-0 truncate">{item.product?.name ?? '—'}</span>
              <span className="text-gray-500 flex-shrink-0 font-medium">{item.quantity} แผ่น</span>
            </div>
          ))}
        </div>
      ) : canEdit ? (
        <button onClick={() => onOpenItemsEdit(d)}
          className="text-xs text-gray-400 hover:text-pink-600 border border-dashed border-gray-200 rounded-xl py-2 w-full">
          + เพิ่มรายการสินค้า
        </button>
      ) : null}

      {/* Tracking number */}
      <div>
        {isEditingTracking ? (
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <input
                ref={trackingInputRef}
                type="text" value={trackingDraft} onChange={(e) => onTrackingChange(e.target.value)}
                placeholder="สแกนบาร์โค้ดหรือพิมพ์เลขพัสดุ"
                inputMode="numeric" autoComplete="off"
                className="flex-1 border border-pink-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
              <button onClick={() => onScanTracking(d.id)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-pink-100 text-pink-700 hover:bg-pink-200 flex-shrink-0">
                <BarcodeIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onSaveTracking(d.id)}
                className="flex-1 py-2 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-700">บันทึก</button>
              <button onClick={onCancelTracking}
                className="px-4 py-2 text-gray-400 text-xs border border-gray-200 rounded-xl hover:bg-gray-50">ยกเลิก</button>
            </div>
          </div>
        ) : (
          <button onClick={() => onOpenTracking(d)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-pink-600 transition-colors">
            <span className="text-base">📦</span>
            {d.tracking_number
              ? <span className="font-medium text-gray-700">{d.tracking_number}</span>
              : <span className="text-gray-400 text-xs">เพิ่มเลขพัสดุ...</span>
            }
          </button>
        )}
      </div>

      {d.notes && <p className="text-xs text-gray-400 italic">{d.notes}</p>}

      {next && (
        <button onClick={() => onNextStatus(d)} disabled={isUpdating}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-50
            ${next === 'ได้รับแล้ว'
              ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
              : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
            }`}>
          {isUpdating ? 'กำลังอัปเดต...' : `→ ${next}`}
        </button>
      )}
    </div>
  )
}
