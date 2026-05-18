import { useState, useRef } from 'react'
import { useCategories } from '../hooks/useCategories'
import { useImportCodes } from '../hooks/useCodes'
import { parseExcelCodes } from '../lib/excel'
import type { ExcelCodeEntry } from '../lib/excel'
import { DEFAULT_TEMPLATE } from '../lib/template'
import { showToast } from '../components/Toast'
import type { CodeCategory, ImportResult } from '../types'

export function Settings() {
  const { categories, loading: catLoading, createCategory, updateCategoryTemplate, deleteCategory } = useCategories()
  const { importing, importCodes } = useImportCodes()

  // Create category
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)

  // Import
  const [selectedCatId, setSelectedCatId] = useState<string>('')
  const [pendingCodes, setPendingCodes] = useState<ExcelCodeEntry[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [confirmVisible, setConfirmVisible] = useState(false)

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Template editor
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateDraft, setTemplateDraft] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Category create ─────────────────────────────────────────────────────────
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setCreatingCat(true)
    const { error } = await createCategory(newCatName)
    setCreatingCat(false)
    if (error) {
      showToast(error, 'error')
    } else {
      showToast(`สร้างประเภทโค้ด "${newCatName.trim().toUpperCase()}" สำเร็จ`, 'success')
      setNewCatName('')
    }
  }

  // ── Template editor ─────────────────────────────────────────────────────────
  const openTemplateEditor = (cat: CodeCategory) => {
    setEditingTemplateId(cat.id)
    setTemplateDraft(cat.template ?? DEFAULT_TEMPLATE)
  }

  const closeTemplateEditor = () => {
    setEditingTemplateId(null)
    setTemplateDraft('')
  }

  const handleSaveTemplate = async () => {
    if (!editingTemplateId) return
    if (!templateDraft.includes('{{CODE}}')) {
      showToast('Template ต้องมี {{CODE}} เพื่อระบุตำแหน่งโค้ด', 'error')
      return
    }
    setSavingTemplate(true)
    const { error } = await updateCategoryTemplate(editingTemplateId, templateDraft)
    setSavingTemplate(false)
    if (error) {
      showToast(`บันทึกไม่ได้: ${error}`, 'error')
    } else {
      showToast('บันทึก Template สำเร็จ', 'success')
      closeTemplateEditor()
    }
  }

  const handleResetTemplate = () => {
    setTemplateDraft(DEFAULT_TEMPLATE)
  }

  // ── Delete category ─────────────────────────────────────────────────────────
  const handleDeleteCategory = async (cat: CodeCategory) => {
    if (deleteConfirmId !== cat.id) {
      setDeleteConfirmId(cat.id)
      return
    }
    setDeletingId(cat.id)
    setDeleteConfirmId(null)
    const { error } = await deleteCategory(cat.id)
    setDeletingId(null)
    if (error) {
      showToast(`ลบไม่ได้: ${error}`, 'error')
    } else {
      showToast(`ลบประเภท "${cat.name}" สำเร็จ`, 'success')
      if (selectedCatId === cat.id) setSelectedCatId('')
      if (editingTemplateId === cat.id) closeTemplateEditor()
    }
  }

  // ── Excel import ────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedCatId) {
      showToast('กรุณาเลือกประเภทโค้ดก่อน Import', 'warning')
      e.target.value = ''
      return
    }
    setFileName(file.name)
    setImportResult(null)
    try {
      const codes = await parseExcelCodes(file)
      if (codes.length === 0) {
        showToast('ไม่พบโค้ด 6 หลักในไฟล์ที่เลือก', 'warning')
        e.target.value = ''
        return
      }
      setPendingCodes(codes)
      setConfirmVisible(true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'อ่านไฟล์ไม่ได้', 'error')
    }
    e.target.value = ''
  }

  const handleConfirmImport = async () => {
    if (!pendingCodes || !selectedCatId) return
    setConfirmVisible(false)
    try {
      const result = await importCodes(selectedCatId, pendingCodes)
      setImportResult(result)
      showToast(`นำเข้าสำเร็จ ${result.imported} โค้ด`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการนำเข้า', 'error')
    }
    setPendingCodes(null)
  }

  const selectedCat = categories.find((c) => c.id === selectedCatId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">ตั้งค่า</h1>
        <p className="text-sm text-gray-500 mt-0.5">จัดการประเภทโค้ดและนำเข้าข้อมูล</p>
      </div>

      {/* Create category */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          สร้างประเภทโค้ดใหม่
        </h2>
        <form onSubmit={handleCreateCategory} className="flex gap-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="เช่น B2S, Moshi, WY"
            maxLength={20}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={creatingCat || !newCatName.trim()}
            className="bg-violet-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-violet-700 transition-colors active:scale-95"
          >
            {creatingCat ? '...' : '+ สร้าง'}
          </button>
        </form>
      </section>

      {/* Category list + template editor */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          ประเภทโค้ดทั้งหมด
        </h2>

        {catLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm">ยังไม่มีประเภทโค้ด</p>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.id}>
                {/* Category row */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 font-bold text-sm flex items-center justify-center">
                      {cat.name.slice(0, 2)}
                    </span>
                    <div>
                      <span className="font-medium text-gray-800">{cat.name}</span>
                      {cat.template && (
                        <span className="ml-2 text-xs bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">
                          custom
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() =>
                        editingTemplateId === cat.id ? closeTemplateEditor() : openTemplateEditor(cat)
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95
                        ${editingTemplateId === cat.id
                          ? 'bg-violet-600 text-white'
                          : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
                        }`}
                    >
                      {editingTemplateId === cat.id ? 'ปิด' : '✏️ Template'}
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      disabled={deletingId === cat.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95
                        ${deleteConfirmId === cat.id
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'bg-red-50 text-red-500 hover:bg-red-100'
                        }`}
                    >
                      {deletingId === cat.id ? '...' : deleteConfirmId === cat.id ? 'ยืนยัน?' : 'ลบ'}
                    </button>
                  </div>
                </div>

                {/* Template editor — expands below the selected category row */}
                {editingTemplateId === cat.id && (
                  <div className="mt-2 border border-violet-200 rounded-xl bg-violet-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-violet-700">
                        ✏️ แก้ไข Template — {cat.name}
                      </p>
                      <span className="text-xs text-violet-500">ใช้ {'{{CODE}}'} แทนตำแหน่งโค้ด</span>
                    </div>

                    <textarea
                      value={templateDraft}
                      onChange={(e) => setTemplateDraft(e.target.value)}
                      rows={12}
                      spellCheck={false}
                      className="w-full border border-violet-200 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y"
                    />

                    {!templateDraft.includes('{{CODE}}') && (
                      <p className="text-xs text-red-500 font-medium">
                        ⚠️ Template ต้องมี {'{{CODE}}'} เพื่อระบุตำแหน่งโค้ด
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleResetTemplate}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-100 transition-colors"
                      >
                        รีเซ็ตเป็น Default
                      </button>
                      <button
                        onClick={closeTemplateEditor}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={handleSaveTemplate}
                        disabled={savingTemplate || !templateDraft.includes('{{CODE}}')}
                        className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold disabled:opacity-50 hover:bg-violet-700 transition-colors active:scale-95"
                      >
                        {savingTemplate ? 'กำลังบันทึก...' : '💾 บันทึก Template'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {deleteConfirmId && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            กดปุ่ม "ยืนยัน?" อีกครั้งเพื่อยืนยันการลบ หรือคลิกที่อื่นเพื่อยกเลิก
          </p>
        )}
      </section>

      {/* Import Excel */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          IMPORT โค้ดจาก EXCEL
        </h2>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">เลือกประเภทโค้ด</label>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400 italic">กรุณาสร้างประเภทโค้ดก่อน</p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCatId(cat.id); setImportResult(null) }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95
                    ${selectedCatId === cat.id
                      ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">เลือกไฟล์ Excel</label>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || !selectedCatId}
            className={`w-full border-2 border-dashed rounded-xl py-6 flex flex-col items-center gap-2 transition-colors
              ${!selectedCatId
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'border-violet-200 bg-violet-50 hover:bg-violet-100 cursor-pointer'
              }`}
          >
            <span className="text-3xl">{importing ? '⏳' : '📂'}</span>
            <span className={`text-sm font-medium ${!selectedCatId ? 'text-gray-400' : 'text-violet-600'}`}>
              {importing ? 'กำลังนำเข้า...' : selectedCatId ? 'คลิกเพื่อเลือกไฟล์ .xlsx / .xls' : 'เลือกประเภทโค้ดก่อน'}
            </span>
            {selectedCat && !importing && (
              <span className="text-xs text-violet-500">
                นำเข้าสำหรับ: <strong>{selectedCat.name}</strong>
              </span>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
        </div>

        {importResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-green-700 text-sm">📊 ผลการนำเข้า</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-green-100 rounded-lg py-2">
                <p className="text-xl font-bold text-green-700">{importResult.imported}</p>
                <p className="text-xs text-green-600">นำเข้าสำเร็จ</p>
              </div>
              <div className="bg-yellow-100 rounded-lg py-2">
                <p className="text-xl font-bold text-yellow-700">{importResult.duplicate}</p>
                <p className="text-xs text-yellow-600">ซ้ำ (ข้าม)</p>
              </div>
              <div className="bg-red-100 rounded-lg py-2">
                <p className="text-xl font-bold text-red-700">{importResult.invalid}</p>
                <p className="text-xs text-red-600">ผิดรูปแบบ</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">📌 หมายเหตุ</p>
        <ul className="space-y-1 text-xs list-disc list-inside text-blue-600">
          <li>อ่าน Column A เป็นโค้ด, Column B เป็นสถานะ</li>
          <li>"ยังไม่ถูกใช้" → available · "คัดลอก" หรือค่าอื่น → used</li>
          <li>โค้ดที่ซ้ำกับที่มีอยู่แล้วจะถูกข้ามโดยอัตโนมัติ</li>
          <li>ใช้ {'{{CODE}}'} ใน Template เพื่อกำหนดตำแหน่งโค้ด</li>
        </ul>
      </div>

      {/* Confirm import modal */}
      {confirmVisible && pendingCodes && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <p className="text-4xl mb-2">📥</p>
              <h3 className="font-bold text-gray-900 text-lg">ยืนยันการนำเข้า</h3>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-sm text-center space-y-2">
              <p className="text-gray-500">ไฟล์: <span className="font-medium text-gray-700">{fileName}</span></p>
              <p className="text-gray-500">ประเภท: <span className="font-semibold text-violet-700">{selectedCat?.name}</span></p>
              <p className="text-2xl font-bold text-violet-700 mt-1">{pendingCodes.length} โค้ด</p>
              <div className="flex gap-2 justify-center">
                <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-lg">
                  ✅ พร้อมใช้ {pendingCodes.filter((c) => c.status === 'available').length}
                </span>
                {pendingCodes.filter((c) => c.status === 'used').length > 0 && (
                  <span className="bg-gray-200 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-lg">
                    ✔ ใช้แล้ว {pendingCodes.filter((c) => c.status === 'used').length}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmVisible(false); setPendingCodes(null) }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmImport}
                className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-700 transition-colors active:scale-95"
              >
                นำเข้า
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
