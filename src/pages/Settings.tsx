import { useState, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useCategories } from '../hooks/useCategories'
import { useImportCodes } from '../hooks/useCodes'
import { useBranches } from '../hooks/useBranches'
import { useProducts } from '../hooks/useProducts'
import { useStockReport } from '../hooks/useStockReport'
import { parseExcelCodes } from '../lib/excel'
import type { ExcelCodeEntry } from '../lib/excel'
import { DEFAULT_TEMPLATE, DEFAULT_STOCK_TEMPLATE } from '../lib/template'
import { showToast } from '../components/Toast'
import { ZoomImage } from '../components/ZoomImage'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { supabase } from '../lib/supabase'
import { useStockTemplate } from '../hooks/useAppSettings'
import { getSimExpiringWithin30Days, formatSimExpiryDate } from '../lib/simExpiry'
import { downloadBranchCsv } from '../lib/branchCsv'
import type { CodeCategory, ImportResult, StoreGroup, Branch, Product } from '../types'

type SettingsTab = 'general' | 'store-groups' | 'branches' | 'products' | 'import-sales' | 'import-branches'

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'general', label: 'ทั่วไป', icon: '🎟️' },
  { id: 'store-groups', label: 'ประเภทร้าน', icon: '🏪' },
  { id: 'branches', label: 'สาขา', icon: '📍' },
  { id: 'products', label: 'สินค้า', icon: '📦' },
  { id: 'import-sales', label: 'นำเข้ายอดขาย', icon: '📥' },
  { id: 'import-branches', label: 'นำเข้าข้อมูลสาขา', icon: '📋' },
]

export function Settings({ simExpiryCount = 0 }: { simExpiryCount?: number }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">ตั้งค่า</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการข้อมูลระบบ</p>
      </div>

      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`relative flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${activeTab === tab.id ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <span>{tab.icon}</span><span>{tab.label}</span>
            {tab.id === 'branches' && simExpiryCount > 0 && (
              <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {simExpiryCount > 99 ? '99+' : simExpiryCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'store-groups' && <StoreGroupsTab />}
      {activeTab === 'branches' && <BranchesTab />}
      {activeTab === 'products' && <ProductsTab />}
      {activeTab === 'import-sales' && <ImportSalesTab />}
      {activeTab === 'import-branches' && <ImportBranchesTab />}
    </div>
  )
}

// ── General Tab ───────────────────────────────────────────────────────────────

function GeneralTab() {
  const { categories, loading: catLoading, createCategory, updateCategoryName, updateCategoryTemplate, deleteCategory } = useCategories()
  const { importing, importCodes } = useImportCodes()
  const { template: stockTemplate, loading: stockTemplateLoading, saving: savingStockTemplate, updateTemplate: updateStockTemplate } = useStockTemplate()

  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const [selectedCatId, setSelectedCatId] = useState<string>('')
  const [pendingCodes, setPendingCodes] = useState<ExcelCodeEntry[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateDraft, setTemplateDraft] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Edit name inline
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [stockTemplateDraft, setStockTemplateDraft] = useState('')
  const [editingStockTemplate, setEditingStockTemplate] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setCreatingCat(true)
    const { error } = await createCategory(newCatName)
    setCreatingCat(false)
    if (error) showToast(error, 'error')
    else { showToast(`สร้างประเภทโค้ด "${newCatName.trim().toUpperCase()}" สำเร็จ`, 'success'); setNewCatName('') }
  }

  const openNameEdit = (cat: CodeCategory) => { setEditingNameId(cat.id); setNameDraft(cat.name) }

  const handleSaveName = async () => {
    if (!editingNameId || !nameDraft.trim()) return
    setSavingName(true)
    const { error } = await updateCategoryName(editingNameId, nameDraft)
    setSavingName(false)
    if (error) showToast(`แก้ไขไม่ได้: ${error}`, 'error')
    else { showToast('แก้ไขชื่อสำเร็จ', 'success'); setEditingNameId(null) }
  }

  const openTemplateEditor = (cat: CodeCategory) => { setEditingTemplateId(cat.id); setTemplateDraft(cat.template ?? DEFAULT_TEMPLATE) }
  const closeTemplateEditor = () => { setEditingTemplateId(null); setTemplateDraft('') }

  const handleSaveTemplate = async () => {
    if (!editingTemplateId) return
    if (!templateDraft.includes('{{CODE}}')) { showToast('Template ต้องมี {{CODE}}', 'error'); return }
    setSavingTemplate(true)
    const { error } = await updateCategoryTemplate(editingTemplateId, templateDraft)
    setSavingTemplate(false)
    if (error) showToast(`บันทึกไม่ได้: ${error}`, 'error')
    else { showToast('บันทึก Template สำเร็จ', 'success'); closeTemplateEditor() }
  }

  const openStockTemplateEditor = () => {
    setStockTemplateDraft(stockTemplate)
    setEditingStockTemplate(true)
  }

  const closeStockTemplateEditor = () => {
    setEditingStockTemplate(false)
    setStockTemplateDraft('')
  }

  const handleSaveStockTemplate = async () => {
    if (!stockTemplateDraft.includes('{{PRODUCT}}') || !stockTemplateDraft.includes('{{QUANTITY}}')) {
      showToast('Template ต้องมี {{PRODUCT}} และ {{QUANTITY}}', 'error')
      return
    }
    const { error } = await updateStockTemplate(stockTemplateDraft)
    if (error) showToast(`บันทึกไม่ได้: ${error}`, 'error')
    else { showToast('บันทึก Template Stock สำเร็จ', 'success'); closeStockTemplateEditor() }
  }

  const handleDeleteCategory = async (cat: CodeCategory) => {
    if (deleteConfirmId !== cat.id) { setDeleteConfirmId(cat.id); return }
    setDeletingId(cat.id); setDeleteConfirmId(null)
    const { error } = await deleteCategory(cat.id)
    setDeletingId(null)
    if (error) showToast(`ลบไม่ได้: ${error}`, 'error')
    else {
      showToast(`ลบประเภท "${cat.name}" สำเร็จ`, 'success')
      if (selectedCatId === cat.id) setSelectedCatId('')
      if (editingTemplateId === cat.id) closeTemplateEditor()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedCatId) { showToast('กรุณาเลือกประเภทโค้ดก่อน Import', 'warning'); e.target.value = ''; return }
    setFileName(file.name); setImportResult(null)
    try {
      const codes = await parseExcelCodes(file)
      if (codes.length === 0) { showToast('ไม่พบโค้ด 6 หลักในไฟล์ที่เลือก', 'warning'); e.target.value = ''; return }
      setPendingCodes(codes); setConfirmVisible(true)
    } catch (err) { showToast(err instanceof Error ? err.message : 'อ่านไฟล์ไม่ได้', 'error') }
    e.target.value = ''
  }

  const handleConfirmImport = async () => {
    if (!pendingCodes || !selectedCatId) return
    setConfirmVisible(false)
    try {
      const result = await importCodes(selectedCatId, pendingCodes)
      setImportResult(result)
      showToast(`นำเข้าสำเร็จ ${result.imported} โค้ด`, 'success')
    } catch (err) { showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error') }
    setPendingCodes(null)
  }

  const selectedCat = categories.find((c) => c.id === selectedCatId)

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">สร้างประเภทโค้ดใหม่</h2>
        <form onSubmit={handleCreateCategory} className="flex gap-2">
          <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
            placeholder="เช่น B2S, Moshi, WY" maxLength={20}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          <button type="submit" disabled={creatingCat || !newCatName.trim()}
            className="bg-pink-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
            {creatingCat ? '...' : '+ สร้าง'}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">ประเภทโค้ดทั้งหมด</h2>
        {catLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p className="text-3xl mb-2">📭</p><p className="text-sm">ยังไม่มีประเภทโค้ด</p></div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.id}>
                {editingNameId === cat.id ? (
                  <div className="flex gap-2 items-center p-3 rounded-xl bg-pink-50 border border-pink-200">
                    <input type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={20} autoFocus
                      className="flex-1 border border-pink-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
                    <button onClick={handleSaveName} disabled={savingName || !nameDraft.trim()}
                      className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs font-bold hover:bg-pink-700 disabled:opacity-50">
                      {savingName ? '...' : 'บันทึก'}
                    </button>
                    <button onClick={() => setEditingNameId(null)}
                      className="px-2 py-1.5 text-gray-400 text-xs hover:text-gray-600">ยกเลิก</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-pink-100 text-pink-700 font-bold text-sm flex items-center justify-center">{cat.name.slice(0, 2)}</span>
                      <div>
                        <span className="font-medium text-gray-800">{cat.name}</span>
                        {cat.template && <span className="ml-2 text-xs bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded">custom</span>}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => openNameEdit(cat)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all active:scale-95">
                        ✏️
                      </button>
                      <button onClick={() => editingTemplateId === cat.id ? closeTemplateEditor() : openTemplateEditor(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95
                          ${editingTemplateId === cat.id ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-600 hover:bg-pink-100'}`}>
                        {editingTemplateId === cat.id ? 'ปิด' : 'Template'}
                      </button>
                      <button onClick={() => handleDeleteCategory(cat)} disabled={deletingId === cat.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95
                          ${deleteConfirmId === cat.id ? 'bg-red-500 text-white animate-pulse' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}>
                        {deletingId === cat.id ? '...' : deleteConfirmId === cat.id ? 'ยืนยัน?' : 'ลบ'}
                      </button>
                    </div>
                  </div>
                )}
                {editingTemplateId === cat.id && (
                  <div className="mt-2 border border-pink-200 rounded-xl bg-pink-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-pink-700">✏️ แก้ไข Template — {cat.name}</p>
                      <span className="text-xs text-pink-500">ใช้ {'{{CODE}}'} แทนตำแหน่งโค้ด</span>
                    </div>
                    <textarea value={templateDraft} onChange={(e) => setTemplateDraft(e.target.value)} rows={12} spellCheck={false}
                      className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 resize-y" />
                    {!templateDraft.includes('{{CODE}}') && (
                      <p className="text-xs text-red-500 font-medium">⚠️ Template ต้องมี {'{{CODE}}'}</p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setTemplateDraft(DEFAULT_TEMPLATE)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-100">รีเซ็ต</button>
                      <button onClick={closeTemplateEditor}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50">ยกเลิก</button>
                      <button onClick={handleSaveTemplate} disabled={savingTemplate || !templateDraft.includes('{{CODE}}')}
                        className="flex-1 py-2 rounded-lg bg-pink-600 text-white text-xs font-bold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
                        {savingTemplate ? 'กำลังบันทึก...' : '💾 บันทึก Template'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Template ข้อความแจ้ง Stock</h2>
          {!editingStockTemplate && (
            <button onClick={openStockTemplateEditor} disabled={stockTemplateLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-pink-50 text-pink-600 hover:bg-pink-100 transition-all active:scale-95 disabled:opacity-50">
              แก้ไข Template
            </button>
          )}
        </div>
        {stockTemplateLoading ? (
          <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ) : editingStockTemplate ? (
          <div className="border border-pink-200 rounded-xl bg-pink-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-pink-700">✏️ แก้ไข Template แจ้ง Stock</p>
              <span className="text-xs text-pink-500">ใช้ {'{{PRODUCT}}'} และ {'{{QUANTITY}}'}</span>
            </div>
            <textarea value={stockTemplateDraft} onChange={(e) => setStockTemplateDraft(e.target.value)} rows={6} spellCheck={false}
              className="w-full border border-pink-200 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 resize-y" />
            {(!stockTemplateDraft.includes('{{PRODUCT}}') || !stockTemplateDraft.includes('{{QUANTITY}}')) && (
              <p className="text-xs text-red-500 font-medium">⚠️ Template ต้องมี {'{{PRODUCT}}'} และ {'{{QUANTITY}}'}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStockTemplateDraft(DEFAULT_STOCK_TEMPLATE)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-100">รีเซ็ต</button>
              <button onClick={closeStockTemplateEditor}
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50">ยกเลิก</button>
              <button onClick={handleSaveStockTemplate}
                disabled={savingStockTemplate || !stockTemplateDraft.includes('{{PRODUCT}}') || !stockTemplateDraft.includes('{{QUANTITY}}')}
                className="flex-1 py-2 rounded-lg bg-pink-600 text-white text-xs font-bold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
                {savingStockTemplate ? 'กำลังบันทึก...' : '💾 บันทึก Template'}
              </button>
            </div>
          </div>
        ) : (
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 rounded-xl p-4 border border-gray-100">{stockTemplate}</pre>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">IMPORT โค้ดจาก EXCEL</h2>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">เลือกประเภทโค้ด</label>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400 italic">กรุณาสร้างประเภทโค้ดก่อน</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => (
                <button key={cat.id} onClick={() => { setSelectedCatId(cat.id); setImportResult(null) }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95
                    ${selectedCatId === cat.id ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <button onClick={() => fileInputRef.current?.click()} disabled={importing || !selectedCatId}
            className={`w-full border-2 border-dashed rounded-xl py-6 flex flex-col items-center gap-2 transition-colors
              ${!selectedCatId ? 'border-gray-200 bg-gray-50 cursor-not-allowed' : 'border-pink-200 bg-pink-50 hover:bg-pink-100 cursor-pointer'}`}>
            <span className="text-3xl">{importing ? '⏳' : '📂'}</span>
            <span className={`text-sm font-medium ${!selectedCatId ? 'text-gray-400' : 'text-pink-600'}`}>
              {importing ? 'กำลังนำเข้า...' : selectedCatId ? 'คลิกเพื่อเลือกไฟล์ .xlsx / .xls' : 'เลือกประเภทโค้ดก่อน'}
            </span>
            {selectedCat && !importing && <span className="text-xs text-pink-500">นำเข้าสำหรับ: <strong>{selectedCat.name}</strong></span>}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
        </div>
        {importResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-green-700 text-sm">📊 ผลการนำเข้า</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-green-100 rounded-lg py-2"><p className="text-xl font-bold text-green-700">{importResult.imported}</p><p className="text-xs text-green-600">สำเร็จ</p></div>
              <div className="bg-yellow-100 rounded-lg py-2"><p className="text-xl font-bold text-yellow-700">{importResult.duplicate}</p><p className="text-xs text-yellow-600">ซ้ำ</p></div>
              <div className="bg-red-100 rounded-lg py-2"><p className="text-xl font-bold text-red-700">{importResult.invalid}</p><p className="text-xs text-red-600">ผิดรูปแบบ</p></div>
            </div>
          </div>
        )}
      </section>

      {confirmVisible && pendingCodes && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center"><p className="text-4xl mb-2">📥</p><h3 className="font-bold text-gray-900 text-lg">ยืนยันการนำเข้า</h3></div>
            <div className="bg-gray-50 rounded-xl p-3 text-sm text-center space-y-1">
              <p className="text-gray-500">ไฟล์: <span className="font-medium text-gray-700">{fileName}</span></p>
              <p className="text-gray-500">ประเภท: <span className="font-semibold text-pink-700">{selectedCat?.name}</span></p>
              <p className="text-2xl font-bold text-pink-700">{pendingCodes.length} โค้ด</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setConfirmVisible(false); setPendingCodes(null) }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">ยกเลิก</button>
              <button onClick={handleConfirmImport}
                className="flex-1 py-3 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 active:scale-95">นำเข้า</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Store Groups Tab ──────────────────────────────────────────────────────────

function StoreGroupsTab() {
  const { storeGroups, loading, createStoreGroup, updateStoreGroup, deleteStoreGroup } = useBranches()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    const { error } = await createStoreGroup(name)
    setCreating(false)
    if (error) showToast(`สร้างไม่ได้: ${error}`, 'error')
    else { showToast(`สร้างประเภทร้าน "${name.trim().toUpperCase()}" สำเร็จ`, 'success'); setName('') }
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return
    setSavingEdit(true)
    const { error } = await updateStoreGroup(editingId, editName)
    setSavingEdit(false)
    if (error) showToast(`แก้ไขไม่ได้: ${error}`, 'error')
    else { showToast('แก้ไขชื่อสำเร็จ', 'success'); setEditingId(null) }
  }

  const handleDelete = async (sg: StoreGroup) => {
    if (confirmId !== sg.id) { setConfirmId(sg.id); return }
    setDeletingId(sg.id); setConfirmId(null)
    const { error } = await deleteStoreGroup(sg.id)
    setDeletingId(null)
    if (error) showToast(`ลบไม่ได้: ${error}`, 'error')
    else showToast(`ลบ "${sg.name}" สำเร็จ`, 'success')
  }

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">เพิ่มประเภทร้าน</h2>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="เช่น B2S, Moshi, WY" maxLength={20}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          <button type="submit" disabled={creating || !name.trim()}
            className="bg-pink-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
            {creating ? '...' : '+ เพิ่ม'}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">ประเภทร้านทั้งหมด</h2>
        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : storeGroups.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p className="text-3xl mb-2">🏪</p><p className="text-sm">ยังไม่มีประเภทร้าน</p></div>
        ) : (
          <div className="space-y-2">
            {storeGroups.map((sg) => (
              <div key={sg.id}>
                {editingId === sg.id ? (
                  <div className="flex gap-2 items-center p-3 rounded-xl bg-pink-50 border border-pink-200">
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                      maxLength={20} autoFocus
                      className="flex-1 border border-pink-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
                    <button onClick={handleSaveEdit} disabled={savingEdit || !editName.trim()}
                      className="px-3 py-1.5 bg-pink-600 text-white rounded-lg text-xs font-bold hover:bg-pink-700 disabled:opacity-50">
                      {savingEdit ? '...' : 'บันทึก'}
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-2 py-1.5 text-gray-400 text-xs hover:text-gray-600">ยกเลิก</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-pink-100 text-pink-700 font-bold text-sm flex items-center justify-center">{sg.name.slice(0, 2)}</span>
                      <span className="font-medium text-gray-800">{sg.name}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => { setEditingId(sg.id); setEditName(sg.name) }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95">✏️</button>
                      <button onClick={() => handleDelete(sg)} disabled={deletingId === sg.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95
                          ${confirmId === sg.id ? 'bg-red-500 text-white animate-pulse' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}>
                        {deletingId === sg.id ? '...' : confirmId === sg.id ? 'ยืนยัน?' : 'ลบ'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Branches Tab ──────────────────────────────────────────────────────────────

function BarcodeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M2 6h1v12H2V6zm3 0h1v12H5V6zm2 0h2v12H7V6zm3 0h1v12h-1V6zm2 0h3v12h-3V6zm4 0h1v12h-1V6zm2 0h2v12h-2V6zm3 0h1v12h-1V6z" />
    </svg>
  )
}

function BranchesTab() {
  const { storeGroups, branches, loading, createBranch, updateBranch, toggleBranch, deleteBranch } = useBranches()
  const [filterGroupId, setFilterGroupId] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [branchName, setBranchName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Edit branch
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editStoreGroupId, setEditStoreGroupId] = useState('')
  const [editRent, setEditRent] = useState('')
  const [editGpPercent, setEditGpPercent] = useState('')
  const [editKioskSimPhone, setEditKioskSimPhone] = useState('')
  const [editSimCode, setEditSimCode] = useState('')
  const [editSimExpiryDate, setEditSimExpiryDate] = useState('')
  const [showSimScanner, setShowSimScanner] = useState(false)
  const [showSimExpiryAlert, setShowSimExpiryAlert] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  const expiringSimBranches = useMemo(() => getSimExpiringWithin30Days(branches), [branches])

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      if (filterGroupId && b.store_group_id !== filterGroupId) return false
      if (searchText.trim() && !b.name.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
  }, [branches, filterGroupId, searchText])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroupId || !branchName.trim()) return
    setCreating(true)
    const { error } = await createBranch({ store_group_id: selectedGroupId, name: branchName, address, phone })
    setCreating(false)
    if (error) showToast(`สร้างไม่ได้: ${error}`, 'error')
    else { showToast(`สร้างสาขา "${branchName}" สำเร็จ`, 'success'); setBranchName(''); setAddress(''); setPhone('') }
  }

  const openEdit = (b: Branch) => {
    setEditingBranch(b)
    setEditName(b.name)
    setEditAddress(b.address ?? '')
    setEditPhone(b.phone ?? '')
    setEditStoreGroupId(b.store_group_id)
    setEditRent(b.rent != null ? String(b.rent) : '')
    setEditGpPercent(b.gp_percent != null ? String(b.gp_percent) : '')
    setEditKioskSimPhone(b.kiosk_sim_phone ?? '')
    setEditSimCode(b.sim_code ?? '')
    setEditSimExpiryDate(b.sim_expiry_date ?? '')
  }

  const handleSaveEdit = async () => {
    if (!editingBranch || !editName.trim() || !editStoreGroupId) return
    setSavingEdit(true)
    const { error } = await updateBranch(editingBranch.id, {
      name: editName.trim(),
      address: editAddress.trim() || undefined,
      phone: editPhone.trim() || undefined,
      store_group_id: editStoreGroupId,
      rent: editRent !== '' ? parseFloat(editRent) : null,
      gp_percent: editGpPercent !== '' ? parseFloat(editGpPercent) : null,
      kiosk_sim_phone: editKioskSimPhone.trim() || null,
      sim_code: editSimCode.trim() || null,
      sim_expiry_date: editSimExpiryDate || null,
    })
    setSavingEdit(false)
    if (error) showToast(`แก้ไขไม่ได้: ${error}`, 'error')
    else { showToast('แก้ไขสาขาสำเร็จ', 'success'); setEditingBranch(null) }
  }

  const handleDelete = async (b: Branch) => {
    if (confirmId !== b.id) { setConfirmId(b.id); return }
    setDeletingId(b.id); setConfirmId(null)
    const { error } = await deleteBranch(b.id)
    setDeletingId(null)
    if (error) showToast(`ลบไม่ได้: ${error}`, 'error')
    else showToast(`ลบสาขา "${b.name}" สำเร็จ`, 'success')
  }

  const handleToggle = async (b: Branch) => {
    setTogglingId(b.id)
    const { error } = await toggleBranch(b.id, !b.is_active)
    setTogglingId(null)
    if (error) showToast(`เปลี่ยนสถานะไม่ได้: ${error}`, 'error')
    else showToast(b.is_active ? `ปิดสาขา "${b.name}" แล้ว` : `เปิดสาขา "${b.name}" แล้ว`, 'success')
  }

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">เพิ่มสาขา</h2>
        {storeGroups.length === 0 ? (
          <p className="text-sm text-gray-400 italic">กรุณาสร้างประเภทร้านก่อน (แท็บ "ประเภทร้าน")</p>
        ) : (
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">ประเภทร้าน *</label>
              <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white" required>
                <option value="">— เลือกประเภทร้าน —</option>
                {storeGroups.map((sg) => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
              </select>
            </div>
            <input type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)}
              placeholder="ชื่อสาขา *" maxLength={50} required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
            <textarea value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="ที่อยู่สาขา..." rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none" />
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="เบอร์โทร"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
            <button type="submit" disabled={creating || !selectedGroupId || !branchName.trim()}
              className="w-full bg-pink-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
              {creating ? '...' : '+ เพิ่มสาขา'}
            </button>
          </form>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">สาขาทั้งหมด</h2>
          <button
            type="button"
            onClick={() => setShowSimExpiryAlert(true)}
            className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 active:scale-95 transition-all"
          >
            ⚠️ แจ้งเตือน SIM ที่ใกล้หมดอายุ 30วัน
            {expiringSimBranches.length > 0 && (
              <span className="ml-1.5 bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">{expiringSimBranches.length}</span>
            )}
          </button>
        </div>

        {/* Filter + Search */}
        <div className="space-y-2 mb-4">
          <div className="relative">
            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
              placeholder="ค้นหาชื่อสาขา..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
            {searchText && (
              <button onClick={() => setSearchText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterGroupId('')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                ${!filterGroupId ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              ทั้งหมด
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${!filterGroupId ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-500'}`}>{branches.length}</span>
            </button>
            {storeGroups.map((sg) => {
              const count = branches.filter((b) => b.store_group_id === sg.id).length
              return (
                <button key={sg.id} onClick={() => setFilterGroupId(sg.id === filterGroupId ? '' : sg.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                    ${filterGroupId === sg.id ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {sg.name}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filterGroupId === sg.id ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : filteredBranches.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p className="text-3xl mb-2">📍</p><p className="text-sm">ไม่พบสาขา</p></div>
        ) : (
          <div className="space-y-2">
            {filteredBranches.map((b) => (
              <div key={b.id} className={`p-3 rounded-xl border transition-colors ${b.is_active ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-200 opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {b.store_group && (
                        <span className="text-xs font-semibold bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded">{b.store_group.name}</span>
                      )}
                      <p className={`font-medium text-sm ${b.is_active ? 'text-gray-800' : 'text-gray-400'}`}>{b.name}</p>
                      {!b.is_active && (
                        <span className="text-xs font-semibold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">ปิด</span>
                      )}
                    </div>
                    {b.address && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{b.address}</p>}
                    {b.phone && (
                      <a href={`tel:${b.phone}`} className="inline-flex items-center gap-1 text-xs text-pink-600 font-medium mt-0.5 hover:underline">
                        📞 {b.phone}
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => handleToggle(b)} disabled={togglingId === b.id}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-50
                        ${b.is_active
                          ? 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200'}`}>
                      {togglingId === b.id ? '...' : b.is_active ? '🟢 เปิด' : '⭕ ปิด'}
                    </button>
                    <button onClick={() => openEdit(b)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95">✏️</button>
                    <button onClick={() => handleDelete(b)} disabled={deletingId === b.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95
                        ${confirmId === b.id ? 'bg-red-500 text-white animate-pulse' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}>
                      {deletingId === b.id ? '...' : confirmId === b.id ? 'ยืนยัน?' : 'ลบ'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit branch modal */}
      {editingBranch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900 text-lg">✏️ แก้ไขสาขา</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">ประเภทร้าน *</label>
                <select value={editStoreGroupId} onChange={(e) => setEditStoreGroupId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white" required>
                  <option value="">— เลือกประเภทร้าน —</option>
                  {storeGroups.map((sg) => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">ชื่อสาขา *</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={50}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">ที่อยู่</label>
                <textarea value={editAddress} onChange={(e) => setEditAddress(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">เบอร์โทร</label>
                <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">เบอร์โทร Kiosk SIM</label>
                <input type="tel" value={editKioskSimPhone} onChange={(e) => setEditKioskSimPhone(e.target.value)}
                  placeholder="เช่น 099-123-4567"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">SIM Code</label>
                <div className="flex gap-2">
                  <input type="text" value={editSimCode} onChange={(e) => setEditSimCode(e.target.value)}
                    placeholder="พิมพ์หรือสแกนบาร์โค้ด"
                    autoComplete="off"
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
                  <button type="button" onClick={() => setShowSimScanner(true)}
                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-pink-100 text-pink-700 hover:bg-pink-200 transition-colors flex-shrink-0">
                    <BarcodeIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">วันหมดอายุ</label>
                <input type="date" value={editSimExpiryDate} onChange={(e) => setEditSimExpiryDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">ค่าเช่า (บาท/เดือน)</label>
                  <input type="number" min="0" step="0.01" value={editRent} onChange={(e) => setEditRent(e.target.value)}
                    placeholder="เช่น 3846"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">GP (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={editGpPercent} onChange={(e) => setEditGpPercent(e.target.value)}
                    placeholder="เช่น 15"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingBranch(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">ยกเลิก</button>
              <button onClick={handleSaveEdit} disabled={savingEdit || !editName.trim() || !editStoreGroupId}
                className="flex-1 py-3 rounded-xl bg-pink-600 text-white font-bold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
                {savingEdit ? 'กำลังบันทึก...' : '💾 บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSimScanner && (
        <BarcodeScanner
          onDetected={(val) => { setEditSimCode(val); setShowSimScanner(false); showToast(`สแกนได้: ${val}`, 'success') }}
          onClose={() => setShowSimScanner(false)}
        />
      )}

      {showSimExpiryAlert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">⚠️ SIM ใกล้หมดอายุ</h3>
                <p className="text-xs text-gray-500 mt-0.5">สาขาที่หมดอายุภายใน 30 วัน — เรียงจากวันที่ใกล้หมดอายุที่สุด</p>
              </div>
              <button onClick={() => setShowSimExpiryAlert(false)}
                className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 flex-shrink-0">✕</button>
            </div>
            {expiringSimBranches.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-sm">ไม่มี SIM ที่ใกล้หมดอายุภายใน 30 วัน</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
                {expiringSimBranches.map((b) => {
                  const expiry = new Date(b.sim_expiry_date! + 'T00:00:00')
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                  const isExpired = daysLeft < 0
                  return (
                    <div key={b.id} className={`p-3 rounded-xl border ${isExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {b.store_group && (
                              <span className="text-xs font-semibold bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded">{b.store_group.name}</span>
                            )}
                            <p className="font-medium text-sm text-gray-800">{b.name}</p>
                          </div>
                          {b.kiosk_sim_phone && (
                            <a href={`tel:${b.kiosk_sim_phone}`} className="inline-flex items-center gap-1 text-xs text-pink-600 font-medium mt-0.5 hover:underline">
                              📱 {b.kiosk_sim_phone}
                            </a>
                          )}
                          {b.sim_code && <p className="text-xs text-gray-500 mt-0.5 font-mono">SIM: {b.sim_code}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xs font-bold ${isExpired ? 'text-red-600' : 'text-amber-700'}`}>
                            {formatSimExpiryDate(b.sim_expiry_date!)}
                          </p>
                          <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-500' : 'text-amber-600'}`}>
                            {isExpired ? `หมดอายุแล้ว ${Math.abs(daysLeft)} วัน` : `เหลือ ${daysLeft} วัน`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={() => setShowSimExpiryAlert(false)}
              className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 flex-shrink-0">ปิด</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab() {
  const { products, loading, createProduct, updateProduct, deleteProduct } = useProducts()
  const { storeGroups } = useBranches()
  const { data: stockData } = useStockReport()
  const [productSearch, setProductSearch] = useState('')
  const [filterGroupId, setFilterGroupId] = useState('')

  // Products that appear in stock for a given store group
  const filteredProducts = useMemo(() => {
    let list = products
    if (filterGroupId) {
      const productIdsInGroup = new Set(
        stockData
          .filter((s) => s.branch?.store_group?.id === filterGroupId || s.branch?.store_group_id === filterGroupId)
          .map((s) => s.product_id)
      )
      list = list.filter((p) => productIdsInGroup.has(p.id))
    }
    if (productSearch.trim()) {
      list = list.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    }
    return list
  }, [products, productSearch, filterGroupId, stockData])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit product
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImagePreview, setEditImagePreview] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const editFileRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, forEdit = false) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (forEdit) setEditImagePreview(ev.target?.result as string)
      else setImagePreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
    if (forEdit) setEditImageFile(file)
    else setImageFile(file)
    e.target.value = ''
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    const { error } = await createProduct(name, description, imageFile ?? undefined)
    setCreating(false)
    if (error) showToast(`สร้างไม่ได้: ${error}`, 'error')
    else { showToast(`เพิ่มสินค้า "${name}" สำเร็จ`, 'success'); setName(''); setDescription(''); setImageFile(null); setImagePreview('') }
  }

  const openEdit = (p: Product) => {
    setEditingProduct(p); setEditName(p.name); setEditDesc(p.description ?? ''); setEditImageFile(null); setEditImagePreview(p.image_url ?? '')
  }

  const handleSaveEdit = async () => {
    if (!editingProduct || !editName.trim()) return
    setSavingEdit(true)
    const { error } = await updateProduct(editingProduct.id, editName, editDesc, editImageFile ?? undefined, editingProduct.image_url)
    setSavingEdit(false)
    if (error) showToast(`แก้ไขไม่ได้: ${error}`, 'error')
    else { showToast('แก้ไขสินค้าสำเร็จ', 'success'); setEditingProduct(null) }
  }

  const handleDelete = async (p: Product) => {
    if (confirmId !== p.id) { setConfirmId(p.id); return }
    setDeletingId(p.id); setConfirmId(null)
    const { error } = await deleteProduct(p.id, p.image_url)
    setDeletingId(null)
    if (error) showToast(`ลบไม่ได้: ${error}`, 'error')
    else showToast(`ลบสินค้า "${p.name}" สำเร็จ`, 'success')
  }

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">เพิ่มสินค้า</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อสินค้า *" maxLength={100} required
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="คำอธิบาย..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-pink-200 bg-pink-50 hover:bg-pink-100 rounded-xl py-4 flex flex-col items-center gap-1.5">
            {imagePreview ? (
              <img src={imagePreview} alt="preview" className="w-20 h-20 rounded-xl object-cover" />
            ) : (
              <><span className="text-2xl">🖼️</span><span className="text-xs text-pink-600 font-medium">คลิกเพื่อเลือกรูป</span></>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleImageChange(e)} className="hidden" />
          <button type="submit" disabled={creating || !name.trim()}
            className="w-full bg-pink-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
            {creating ? 'กำลังอัปโหลด...' : '+ เพิ่มสินค้า'}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            สินค้าทั้งหมด ({filteredProducts.length}{filterGroupId ? `/${products.length}` : ''})
          </h2>
        </div>

        {/* Store group filter */}
        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={() => setFilterGroupId('')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
              ${!filterGroupId ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            ทั้งหมด
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${!filterGroupId ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-500'}`}>{products.length}</span>
          </button>
          {storeGroups.map((sg) => {
            const count = new Set(
              stockData
                .filter((s) => s.branch?.store_group?.id === sg.id || s.branch?.store_group_id === sg.id)
                .map((s) => s.product_id)
            ).size
            return (
              <button key={sg.id} onClick={() => setFilterGroupId(sg.id === filterGroupId ? '' : sg.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${filterGroupId === sg.id ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {sg.name}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filterGroupId === sg.id ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-500'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
          {productSearch && (
            <button onClick={() => setProductSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-gray-400"><p className="text-3xl mb-2">📦</p><p className="text-sm">{filterGroupId ? 'ไม่มีสินค้าในประเภทร้านนี้' : 'ยังไม่มีสินค้า'}</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredProducts.map((p) => (
              <div key={p.id} className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                {p.image_url ? (
                  <ZoomImage src={p.image_url} alt={p.name} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center">
                    <span className="text-3xl">📦</span>
                  </div>
                )}
                <div className="p-2">
                  <p className="font-medium text-gray-800 text-xs leading-tight line-clamp-2">{p.name}</p>
                  {p.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.description}</p>}
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => openEdit(p)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95">✏️ แก้ไข</button>
                    <button onClick={() => handleDelete(p)} disabled={deletingId === p.id}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95
                        ${confirmId === p.id ? 'bg-red-500 text-white animate-pulse' : 'bg-red-50 text-red-400 hover:bg-red-100'}`}>
                      {deletingId === p.id ? '...' : confirmId === p.id ? 'ยืนยัน?' : 'ลบ'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Edit product modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">✏️ แก้ไขสินค้า</h3>
            <div className="space-y-3">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={100}
                placeholder="ชื่อสินค้า *"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
              <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                placeholder="คำอธิบาย..."
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
              <button type="button" onClick={() => editFileRef.current?.click()}
                className="w-full border-2 border-dashed border-pink-200 bg-pink-50 hover:bg-pink-100 rounded-xl py-3 flex flex-col items-center gap-1.5">
                {editImagePreview ? (
                  <img src={editImagePreview} alt="preview" className="w-16 h-16 rounded-xl object-cover" />
                ) : (
                  <><span className="text-xl">🖼️</span><span className="text-xs text-pink-600 font-medium">เปลี่ยนรูปภาพ</span></>
                )}
              </button>
              <input ref={editFileRef} type="file" accept="image/*" onChange={(e) => handleImageChange(e, true)} className="hidden" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingProduct(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">ยกเลิก</button>
              <button onClick={handleSaveEdit} disabled={savingEdit || !editName.trim()}
                className="flex-1 py-3 rounded-xl bg-pink-600 text-white font-bold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
                {savingEdit ? 'กำลังบันทึก...' : '💾 บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Import Sales Tab ───────────────────────────────────────────────────────────

const SALES_COLUMN_MAP: Record<string, string> = {
  // วันที่ / เวลา
  'วันที่': 'sale_date',          'date': 'sale_date',            'sale_date': 'sale_date',
  'เวลา': 'sale_time',            'time': 'sale_time',            'sale_time': 'sale_time',
  'วันที่เวลา': 'sale_datetime',  'datetime': 'sale_datetime',

  // สาขา
  'สาขา': 'branch_name',          'branch': 'branch_name',        'ชื่อสาขา': 'branch_name',
  'branch name': 'branch_name',   'branchname': 'branch_name',
  'รหัสสาขา': 'branch_code',      'branchcode': 'branch_code',    'branchid': 'branch_code',

  // เลขที่ใบเสร็จ
  'เลขที่': 'transaction_no',     'เลขที่ใบเสร็จ': 'transaction_no', 'เลขที่รายการ': 'transaction_no',
  'transactionno': 'transaction_no', 'billno': 'transaction_no',   'receiptno': 'transaction_no',

  // สินค้า
  'รหัสสินค้า': 'product_code',   'productcode': 'product_code',  'itemcode': 'product_code',
  'ชื่อสินค้า': 'product_name',   'productname': 'product_name',  'itemname': 'product_name',
  'สินค้า': 'product_name',       'รายการ': 'product_name',       'item': 'product_name',
  'ประเภท': 'category',           'หมวดหมู่': 'category',         'category': 'category',       'กลุ่มสินค้า': 'category',

  // จำนวน
  'จำนวน': 'quantity',            'qty': 'quantity',              'quantity': 'quantity',
  'จน.': 'quantity',              'จำนวนขาย': 'quantity',         'จำนวนชิ้น': 'quantity',

  // ราคาต่อหน่วย
  'ราคา': 'unit_price',           'ราคาต่อหน่วย': 'unit_price',   'unitprice': 'unit_price',
  'price': 'unit_price',          'ราคาขาย': 'unit_price',        'ราคา/หน่วย': 'unit_price',

  // ส่วนลด
  'ส่วนลด': 'discount',           'discount': 'discount',         'disc': 'discount',

  // ยอดรวม / ยอดขาย
  'ยอดรวม': 'total_amount',       'ยอดขาย': 'total_amount',       'totalamount': 'total_amount',
  'total': 'total_amount',        'amount': 'total_amount',        'ยอดเงิน': 'total_amount',
  'จำนวนเงิน': 'total_amount',    'มูลค่า': 'total_amount',        'ราคารวม': 'total_amount',
  'ยอดสุทธิ': 'total_amount',     'สุทธิ': 'total_amount',         'netsales': 'total_amount',
  'nettotal': 'total_amount',     'nettamount': 'total_amount',    'netamount': 'total_amount',

  // ยอดชำระ
  'ยอดชำระ': 'payment_amount',    'ชำระเงิน': 'payment_amount',   'paymentamount': 'payment_amount',
  'ชำระ': 'payment_amount',       'รับเงิน': 'payment_amount',

  // ช่องทางชำระ
  'ช่องทางชำระ': 'payment_method','วิธีชำระ': 'payment_method',   'paymentmethod': 'payment_method',
  'payment': 'payment_method',    'paytype': 'payment_method',     'ช่องทาง': 'payment_method',
}

const NUMERIC_FIELDS = new Set(['quantity', 'unit_price', 'discount', 'total_amount', 'payment_amount'])

interface ParsedSalesRow {
  report_date: string
  branch_code?: string | null
  branch_name?: string | null
  transaction_no?: string | null
  sale_date?: string | null
  sale_time?: string | null
  sale_datetime?: string | null
  product_code?: string | null
  product_name?: string | null
  category?: string | null
  quantity?: number | null
  unit_price?: number | null
  discount?: number | null
  total_amount?: number | null
  payment_amount?: number | null
  payment_method?: string | null
  raw_data: Record<string, unknown>
}

interface SalesImportResult { inserted: number; deleted: number }

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * แปลงวันที่จากข้อความรูปแบบต่างๆ → YYYY-MM-DD
 * รองรับ: DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD และปีพุทธศักราช (>2400 → ลบ 543)
 */
function parseSaleDateToISO(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim()

  // ISO: 2026-05-21 หรือ 2026-05-21T...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  // DD/MM/YYYY หรือ D/M/YYYY (Gregorian หรือ พ.ศ.)
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/)
  if (m1) {
    let y = parseInt(m1[3]); if (y > 2400) y -= 543
    return `${y}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  }

  // DD/MM/YY
  const m2 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/)
  if (m2) {
    let y = parseInt(m2[3]) + 2000; if (y > 2400) y -= 543
    return `${y}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`
  }

  return null
}

/** ลอง skip 0–14 แถว เพื่อหา header row จริง (เหมือน _try_read_excel ใน Python) */
function detectHeaderRow(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  for (let skip = 0; skip < 15; skip++) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false, defval: null, range: skip,
    })
    // กรองแถวที่ว่างทั้งหมดออก
    const nonEmpty = rows.filter((r) => Object.values(r).some((v) => v != null && String(v).trim() !== ''))
    if (nonEmpty.length === 0) continue
    const headers = Object.keys(nonEmpty[0])
    const emptyCount = headers.filter((h) => /^_{1,2}EMPTY/.test(h)).length
    // ถือว่าเจอ header จริงถ้าคอลัมน์ว่าง < ครึ่งหนึ่ง
    if (headers.length > 1 && emptyCount < headers.length / 2) return nonEmpty
  }
  // fallback
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: null })
}

function parseSalesExcel(
  file: File,
  reportDate: string,
): Promise<{ rows: ParsedSalesRow[]; mappedHeaders: string[]; unmappedHeaders: string[]; headerSkipped: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) { reject(new Error('ไม่สามารถอ่านไฟล์ได้')); return }

        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rawRows = detectHeaderRow(sheet)

        if (rawRows.length === 0) { reject(new Error('ไม่พบข้อมูลในไฟล์')); return }

        // กรองแถวว่างทั้งหมดออกก่อน
        const nonEmptyRows = rawRows.filter((r) =>
          Object.values(r).some((v) => v != null && String(v).trim() !== '')
        )

        // หาชื่อ column จริงที่ map ไปยัง transaction_no และ sale_date
        // (เหมือน Python: กรองแถว summary/grand total ที่ไม่มี transaction_no / sale_date)
        const hasValue = (v: unknown) => v != null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'nan'
        const idColNames = Object.keys(nonEmptyRows[0] ?? {}).filter((h) => {
          const norm = h.trim().toLowerCase().replace(/\s+/g, '')
          const dbField = SALES_COLUMN_MAP[h.trim()] ?? SALES_COLUMN_MAP[norm]
          return dbField === 'transaction_no' || dbField === 'sale_date' || dbField === 'sale_datetime'
        })
        const dataRows = idColNames.length > 0
          ? nonEmptyRows.filter((r) => idColNames.some((col) => hasValue(r[col])))
          : nonEmptyRows

        const allHeaders = Object.keys(dataRows[0])
        const mappedHeaders: string[] = []
        const unmappedHeaders: string[] = []

        for (const h of allHeaders) {
          const norm = h.trim().toLowerCase().replace(/\s+/g, '')
          ;(SALES_COLUMN_MAP[h.trim()] || SALES_COLUMN_MAP[norm] ? mappedHeaders : unmappedHeaders).push(h)
        }

        const rows: ParsedSalesRow[] = dataRows.map((rawRow) => {
          const mapped: Record<string, unknown> = {}
          for (const [origKey, val] of Object.entries(rawRow)) {
            const trimmed = origKey.trim()
            const dbField = SALES_COLUMN_MAP[trimmed] ?? SALES_COLUMN_MAP[trimmed.toLowerCase().replace(/\s+/g, '')]
            if (!dbField) continue
            if (NUMERIC_FIELDS.has(dbField)) {
              // รองรับทั้ง JS number โดยตรง และ string ที่ XLSX format แปลก เช่น "$1.00", "1,234.56"
              if (typeof val === 'number') {
                mapped[dbField] = isFinite(val) ? val : null
              } else {
                const cleaned = String(val ?? '')
                  .trim()
                  .replace(/[$฿€£¥₩%]/g, '')   // ตัด currency symbol ออก
                  .replace(/,/g, '')              // ตัด thousand separator
                  .replace(/\s/g, '')             // ตัด whitespace
                const n = parseFloat(cleaned)
                mapped[dbField] = isNaN(n) ? null : n
              }
            } else {
              mapped[dbField] = val != null && String(val).trim() !== '' ? String(val).trim() : null
            }
          }
          return {
            report_date: reportDate,
            branch_code: mapped.branch_code as string | null,
            branch_name: mapped.branch_name as string | null,
            transaction_no: mapped.transaction_no as string | null,
            sale_date: mapped.sale_date as string | null,
            sale_time: mapped.sale_time as string | null,
            sale_datetime: mapped.sale_datetime as string | null,
            product_code: mapped.product_code as string | null,
            product_name: mapped.product_name as string | null,
            category: mapped.category as string | null,
            quantity: mapped.quantity as number | null,
            unit_price: mapped.unit_price as number | null,
            discount: mapped.discount as number | null,
            total_amount: mapped.total_amount as number | null,
            payment_amount: mapped.payment_amount as number | null,
            payment_method: mapped.payment_method as string | null,
            raw_data: rawRow,
          }
        })

        resolve({ rows, mappedHeaders, unmappedHeaders, headerSkipped: 0 })
      } catch (err) {
        reject(new Error(`อ่านไฟล์ไม่ได้: ${err instanceof Error ? err.message : 'Unknown error'}`))
      }
    }
    reader.onerror = () => reject(new Error('โหลดไฟล์ไม่ได้'))
    reader.readAsArrayBuffer(file)
  })
}

function ImportBranchesTab() {
  const { branches, loading, importBranchesFromCsv } = useBranches()
  const [importingCsv, setImportingCsv] = useState(false)
  const [csvFileName, setCsvFileName] = useState('')
  const csvInputRef = useRef<HTMLInputElement>(null)

  const handleExportCsv = () => {
    if (branches.length === 0) {
      showToast('ไม่มีข้อมูลสาขาให้ Export', 'warning')
      return
    }
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    downloadBranchCsv(branches, `branches-template_${today}.csv`)
    showToast(`Export ${branches.length} สาขาเป็น CSV แล้ว`, 'success')
  }

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    setImportingCsv(true)
    const result = await importBranchesFromCsv(file)
    setImportingCsv(false)
    if (csvInputRef.current) csvInputRef.current.value = ''

    if (result.updated > 0 && result.errors.length === 0) {
      showToast(`Import สำเร็จ: อัปเดต ${result.updated} สาขา`, 'success')
    } else if (result.updated > 0) {
      showToast(`Import บางส่วนสำเร็จ: อัปเดต ${result.updated} สาขา, ข้าม ${result.skipped} แถว`, 'warning')
    } else if (result.errors.length > 0) {
      showToast(result.errors[0], 'error')
    } else {
      showToast('ไม่มีข้อมูลที่ต้องอัปเดต', 'info')
    }
    setCsvFileName('')
  }

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">นำเข้าข้อมูลสาขา</h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          ใช้ไฟล์ CSV เป็น template สำหรับอัปเดตข้อมูลสาขา — ต้องมีคอลัมน์ <span className="font-mono text-pink-600">id</span> เพื่อระบุสาขา
          คอลัมน์ที่ว่างจะไม่เขียนทับข้อมูลเดิม คอลัมน์ที่มีค่าจะอัปเดตทับใน DB
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleExportCsv} disabled={loading || branches.length === 0}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 active:scale-95 transition-all">
            📤 Export CSV
          </button>
          <label className={`px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:scale-95 transition-all cursor-pointer ${importingCsv ? 'opacity-50 pointer-events-none' : ''}`}>
            {importingCsv ? 'กำลัง Import...' : '📥 Import CSV'}
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFileChange} disabled={importingCsv} />
          </label>
        </div>
        {csvFileName && <p className="text-xs text-gray-400">ไฟล์: {csvFileName}</p>}
        <p className="text-xs text-gray-400">
          Template ตัวอย่าง: <span className="font-mono">file/branches-template.csv</span>
        </p>
      </section>
    </div>
  )
}

function ImportSalesTab() {
  const [dateMode, setDateMode] = useState<'manual' | 'auto'>('auto')
  const [reportDate, setReportDate] = useState(getYesterday())
  const [fileName, setFileName] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedSalesRow[] | null>(null)
  const [mappedHeaders, setMappedHeaders] = useState<string[]>([])
  const [unmappedHeaders, setUnmappedHeaders] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<SalesImportResult | null>(null)
  const [existingDates, setExistingDates] = useState<string[]>([])
  const [confirmVisible, setConfirmVisible] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // วันที่ที่ไม่ซ้ำในข้อมูลที่อ่านมา (ใช้ใน auto mode)
  const uniqueDates = useMemo(() => {
    if (!parsedRows) return []
    return [...new Set(parsedRows.map((r) => r.report_date).filter(Boolean))].sort()
  }, [parsedRows])

  const branchSummary = useMemo(() => {
    if (!parsedRows) return []
    const map = new Map<string, number>()
    for (const row of parsedRows) {
      const key = row.branch_name ?? '(ไม่ระบุสาขา)'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [parsedRows])

  const totalAmount = useMemo(
    () => parsedRows?.reduce((s, r) => s + (r.total_amount ?? 0), 0) ?? 0,
    [parsedRows],
  )

  const reset = () => {
    setParsedRows(null)
    setFileName('')
    setMappedHeaders([])
    setUnmappedHeaders([])
    setImportResult(null)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParsedRows(null)
    setImportResult(null)
    setParsing(true)
    try {
      // ส่งวันที่ placeholder ก่อน แล้วค่อย override ถ้าเป็น auto mode
      const { rows, mappedHeaders: mh, unmappedHeaders: um } = await parseSalesExcel(file, reportDate)
      if (rows.length === 0) { showToast('ไม่พบข้อมูลในไฟล์หลังกรองแถวหัวตารางออก', 'warning'); return }

      // โหมดอัตโนมัติ: ใช้วันที่จากคอลัมน์ sale_date ของแต่ละแถว
      let finalRows = rows
      if (dateMode === 'auto') {
        let noDateCount = 0
        finalRows = rows.map((row) => {
          const parsed = parseSaleDateToISO(row.sale_date ?? row.sale_datetime)
          if (!parsed) { noDateCount++; return row }
          return { ...row, report_date: parsed }
        })
        if (noDateCount > 0) {
          showToast(`ไม่พบวันที่ใน ${noDateCount} แถว — แถวเหล่านั้นใช้วันที่ ${reportDate} แทน`, 'warning')
        }
      }

      setParsedRows(finalRows)
      setMappedHeaders(mh)
      setUnmappedHeaders(um)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'อ่านไฟล์ไม่ได้', 'error')
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  const handleImportClick = async () => {
    if (!parsedRows) return
    // ตรวจข้อมูลซ้ำ: ในโหมด auto ตรวจทุกวันที่ที่มีในไฟล์
    const datesToCheck = dateMode === 'auto' ? uniqueDates : [reportDate]
    const { data } = await supabase
      .from('daily_sales_report')
      .select('report_date')
      .in('report_date', datesToCheck)
    const found = [...new Set((data ?? []).map((r: { report_date: string }) => r.report_date as string))]
    setExistingDates(found)
    setConfirmVisible(true)
  }

  const handleConfirmImport = async (replace: boolean) => {
    if (!parsedRows) return
    setConfirmVisible(false)
    setImporting(true)
    try {
      let deleted = 0
      if (replace && existingDates.length > 0) {
        const { error } = await supabase
          .from('daily_sales_report')
          .delete()
          .in('report_date', existingDates)
        if (error) throw new Error(`ลบข้อมูลเดิมไม่ได้: ${error.message}`)
        deleted = existingDates.length
      }

      const BATCH = 500
      let inserted = 0
      for (let i = 0; i < parsedRows.length; i += BATCH) {
        const { error } = await supabase.from('daily_sales_report').insert(parsedRows.slice(i, i + BATCH))
        if (error) throw new Error(`นำเข้าไม่ได้: ${error.message}`)
        inserted += Math.min(BATCH, parsedRows.length - i)
      }

      setImportResult({ inserted, deleted })
      showToast(`นำเข้าสำเร็จ ${inserted.toLocaleString()} แถว`, 'success')
      reset()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* Date mode selector */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">วันที่รายงาน</h2>

        {/* Toggle */}
        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => { setDateMode('auto'); reset() }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${dateMode === 'auto' ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            อัตโนมัติจากไฟล์
          </button>
          <button
            onClick={() => { setDateMode('manual'); reset() }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all
              ${dateMode === 'manual' ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            ระบุวันที่เอง
          </button>
        </div>

        {dateMode === 'auto' ? (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
            ระบบจะอ่านวันที่จากคอลัมน์ <strong>วันที่ / sale_date</strong> ของแต่ละแถวในไฟล์ — เหมาะสำหรับไฟล์ที่มีหลายวัน
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="date" value={reportDate}
              onChange={(e) => { setReportDate(e.target.value); reset() }}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <span className="text-xs text-gray-400">ทุกแถวในไฟล์จะใช้ <code className="bg-gray-100 px-1 rounded">report_date = {reportDate}</code></span>
          </div>
        )}
      </section>

      {/* File upload */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">อัพโหลดไฟล์ยอดขาย</h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={parsing || importing}
          className="w-full border-2 border-dashed border-pink-200 bg-pink-50 hover:bg-pink-100 rounded-xl py-8 flex flex-col items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <span className="text-4xl">{parsing ? '⏳' : '📊'}</span>
          <span className="text-sm font-medium text-pink-600">
            {parsing ? 'กำลังอ่านไฟล์...' : 'คลิกหรือลากไฟล์ .xlsx / .xls มาวาง'}
          </span>
          {fileName && !parsing && (
            <span className="text-xs bg-pink-100 text-pink-600 px-2.5 py-1 rounded-full font-medium">{fileName}</span>
          )}
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
        <p className="text-xs text-gray-400">ใช้ column map เดียวกับ wanyenreport.py — รองรับทั้งภาษาไทยและภาษาอังกฤษ</p>
      </section>

      {/* Preview */}
      {parsedRows && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">ผลการอ่านไฟล์</h2>
            <span className="text-xl font-bold text-pink-700">{parsedRows.length.toLocaleString()} แถว</span>
          </div>

          {/* Column mapping badges */}
          <div className="space-y-2">
            {mappedHeaders.length > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-700 mb-1.5">จับคู่คอลัมน์ได้ ({mappedHeaders.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {mappedHeaders.map((h) => (
                    <span key={h} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{h}</span>
                  ))}
                </div>
              </div>
            )}
            {unmappedHeaders.length > 0 && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1.5">เก็บใน raw_data ({unmappedHeaders.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {unmappedHeaders.map((h) => (
                    <span key={h} className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{h}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date summary (auto mode) */}
          {dateMode === 'auto' && uniqueDates.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">วันที่ที่พบในไฟล์ ({uniqueDates.length} วัน)</p>
              <div className="flex flex-wrap gap-1.5">
                {uniqueDates.map((d) => (
                  <span key={d} className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">{d}</span>
                ))}
              </div>
              {uniqueDates.length === 0 && (
                <p className="text-xs text-orange-600 bg-orange-50 rounded-xl p-3">
                  ไม่สามารถอ่านวันที่จากคอลัมน์ sale_date ได้ — กรุณาเปลี่ยนเป็นโหมด "ระบุวันที่เอง"
                </p>
              )}
            </div>
          )}

          {/* Branch summary */}
          {branchSummary.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">สรุปตามสาขา</p>
              <div className="space-y-1.5">
                {branchSummary.map(([branch, count]) => (
                  <div key={branch} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{branch}</span>
                    <span className="text-sm font-bold text-pink-700">{count.toLocaleString()} แถว</span>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-pink-50 rounded-lg px-3 py-2 border border-pink-100">
                  <span className="text-sm font-semibold text-pink-700">ยอดรวมทั้งหมด</span>
                  <span className="text-sm font-bold text-pink-700">฿{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          {/* Preview table */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">ตัวอย่าง 5 แถวแรก</p>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['สาขา', 'เลขที่', 'สินค้า', 'จำนวน', 'ยอดรวม', 'ช่องทาง'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {parsedRows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[120px] truncate">{row.branch_name ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.transaction_no ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[140px] truncate">{row.product_name ?? '-'}</td>
                      <td className="px-3 py-2 text-gray-500 text-right">{row.quantity ?? '-'}</td>
                      <td className="px-3 py-2 text-pink-700 font-medium text-right whitespace-nowrap">
                        {row.total_amount != null ? `฿${row.total_amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{row.payment_method ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={handleImportClick}
            disabled={importing}
            className="w-full py-3 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 active:scale-95 disabled:opacity-50 transition-all"
          >
            {importing ? 'กำลังนำเข้า...' : `📥 นำเข้า ${parsedRows.length.toLocaleString()} แถว`}
          </button>
        </section>
      )}

      {/* Import result */}
      {importResult && (
        <section className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <p className="font-semibold text-green-700 text-sm">✅ นำเข้าสำเร็จ</p>
          <div className={`grid gap-2 text-center ${importResult.deleted > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="bg-green-100 rounded-xl py-3">
              <p className="text-2xl font-bold text-green-700">{importResult.inserted.toLocaleString()}</p>
              <p className="text-xs text-green-600">แถวที่นำเข้า</p>
            </div>
            {importResult.deleted > 0 && (
              <div className="bg-orange-100 rounded-xl py-3">
                <p className="text-2xl font-bold text-orange-600">{importResult.deleted.toLocaleString()}</p>
                <p className="text-xs text-orange-500">แถวเดิมที่ถูกแทนที่</p>
              </div>
            )}
          </div>
          <p className="text-xs text-green-600">ดูข้อมูลได้ในแท็บ รายงาน → ยอดขาย</p>
        </section>
      )}

      {/* Confirm modal */}
      {confirmVisible && parsedRows && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <p className="text-4xl mb-2">{existingDates.length > 0 ? '⚠️' : '📥'}</p>
              <h3 className="font-bold text-gray-900 text-lg">
                {existingDates.length > 0 ? 'พบข้อมูลซ้ำ' : 'ยืนยันการนำเข้า'}
              </h3>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
              {dateMode === 'auto' ? (
                <div className="flex justify-between">
                  <span className="text-gray-500">วันที่ในไฟล์</span>
                  <span className="font-semibold">
                    {uniqueDates.length} วัน
                    {uniqueDates.length > 0 && (
                      <span className="text-gray-400 font-normal"> ({uniqueDates[0]} – {uniqueDates[uniqueDates.length - 1]})</span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-gray-500">วันที่</span>
                  <span className="font-semibold">{reportDate}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">แถวที่จะนำเข้า</span>
                <span className="font-bold text-pink-700">{parsedRows.length.toLocaleString()} แถว</span>
              </div>
              {existingDates.length > 0 && (
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="text-gray-500">วันที่มีข้อมูลเดิม</span>
                  <span className="font-bold text-orange-600">{existingDates.length} วัน</span>
                </div>
              )}
            </div>
            {existingDates.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-orange-700">วันที่มีข้อมูลอยู่แล้ว:</p>
                <div className="flex flex-wrap gap-1">
                  {existingDates.map((d) => (
                    <span key={d} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{d}</span>
                  ))}
                </div>
                <p className="text-xs text-orange-700">
                  การยืนยันจะ<strong>ลบข้อมูลวันที่เหล่านี้ทั้งหมด</strong>และแทนที่ด้วยข้อมูลใหม่
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmVisible(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50"
              >ยกเลิก</button>
              <button
                onClick={() => handleConfirmImport(existingDates.length > 0)}
                className="flex-1 py-3 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 active:scale-95"
              >
                {existingDates.length > 0 ? '🔄 แทนที่และนำเข้า' : '📥 นำเข้า'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
