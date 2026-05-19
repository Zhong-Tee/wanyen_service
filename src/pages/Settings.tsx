import { useState, useRef, useMemo } from 'react'
import { useCategories } from '../hooks/useCategories'
import { useImportCodes } from '../hooks/useCodes'
import { useBranches } from '../hooks/useBranches'
import { useProducts } from '../hooks/useProducts'
import { useStockReport } from '../hooks/useStockReport'
import { parseExcelCodes } from '../lib/excel'
import type { ExcelCodeEntry } from '../lib/excel'
import { DEFAULT_TEMPLATE } from '../lib/template'
import { showToast } from '../components/Toast'
import { ZoomImage } from '../components/ZoomImage'
import type { CodeCategory, ImportResult, StoreGroup, Branch, Product } from '../types'

type SettingsTab = 'general' | 'store-groups' | 'branches' | 'products'

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'general', label: 'ทั่วไป', icon: '🎟️' },
  { id: 'store-groups', label: 'ประเภทร้าน', icon: '🏪' },
  { id: 'branches', label: 'สาขา', icon: '📍' },
  { id: 'products', label: 'สินค้า', icon: '📦' },
]

export function Settings() {
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
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${activeTab === tab.id ? 'bg-white text-pink-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'store-groups' && <StoreGroupsTab />}
      {activeTab === 'branches' && <BranchesTab />}
      {activeTab === 'products' && <ProductsTab />}
    </div>
  )
}

// ── General Tab ───────────────────────────────────────────────────────────────

function GeneralTab() {
  const { categories, loading: catLoading, createCategory, updateCategoryName, updateCategoryTemplate, deleteCategory } = useCategories()
  const { importing, importCodes } = useImportCodes()

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
  const [savingEdit, setSavingEdit] = useState(false)

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
  }

  const handleSaveEdit = async () => {
    if (!editingBranch || !editName.trim() || !editStoreGroupId) return
    setSavingEdit(true)
    const { error } = await updateBranch(editingBranch.id, {
      name: editName.trim(),
      address: editAddress.trim() || undefined,
      phone: editPhone.trim() || undefined,
      store_group_id: editStoreGroupId,
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
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">สาขาทั้งหมด</h2>

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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
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
