import { useState, useRef, useMemo } from 'react'
import { useJobs } from '../hooks/useJobs'
import { showToast } from '../components/Toast'
import { ZoomImage } from '../components/ZoomImage'
import type { Job } from '../types'

function getDaysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function AgeBadge({ days }: { days: number }) {
  if (days < 3) return null
  if (days < 7) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">
      ⚠️ {days} วัน
    </span>
  )
  if (days < 14) return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
      🔔 {days} วัน
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
      🚨 {days} วัน
    </span>
  )
}

function formatDateRange(createdAt: string, completedAt: string | null): string {
  const start = new Date(createdAt)
  const end = completedAt ? new Date(completedAt) : new Date()
  const diffDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const fmt = (d: Date) => d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  return `${fmt(start)} → ${completedAt ? fmt(end) : 'ปัจจุบัน'} (${diffDays} วัน)`
}

interface JobPageProps {
  onAction?: () => void
}

export function JobPage({ onAction }: JobPageProps) {
  const { jobs, loading, createJob, updateJob, revertJob, completeJob, deleteJob } = useJobs()

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all')
  const toDateStr = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const getFirstOfMonth = () => { const t = new Date(); return toDateStr(new Date(t.getFullYear(), t.getMonth(), 1)) }
  const getToday = () => toDateStr(new Date())

  const [dateFrom, setDateFrom] = useState(getFirstOfMonth)
  const [dateTo, setDateTo] = useState(getToday)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [revertingId, setRevertingId] = useState<string | null>(null)
  const [expandedImages, setExpandedImages] = useState<string | null>(null)

  // Edit state
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setImageFiles((prev) => [...prev, ...files])
    files.forEach((f) => {
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreviews((prev) => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const removeImage = (idx: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx))
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const resetForm = () => { setTitle(''); setDescription(''); setImageFiles([]); setImagePreviews([]); setShowForm(false) }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    const { error } = await createJob(title, description, imageFiles)
    setCreating(false)
    if (error) showToast(`สร้างงานไม่ได้: ${error}`, 'error')
    else { showToast('สร้างงานสำเร็จ', 'success'); resetForm() }
  }

  const openEdit = (job: Job) => {
    setEditingJob(job)
    setEditTitle(job.title)
    setEditDescription(job.description ?? '')
  }

  const handleSaveEdit = async () => {
    if (!editingJob || !editTitle.trim()) return
    setSaving(true)
    const { error } = await updateJob(editingJob.id, editTitle, editDescription)
    setSaving(false)
    if (error) showToast(`บันทึกไม่ได้: ${error}`, 'error')
    else { showToast('บันทึกสำเร็จ', 'success'); setEditingJob(null) }
  }

  const handleComplete = async (id: string) => {
    setCompletingId(id)
    const { error } = await completeJob(id)
    setCompletingId(null)
    if (error) showToast(`เกิดข้อผิดพลาด: ${error}`, 'error')
    else { showToast('งานเสร็จสิ้นแล้ว ✅', 'success'); onAction?.() }
  }

  const handleRevert = async (id: string) => {
    setRevertingId(id)
    const { error } = await revertJob(id)
    setRevertingId(null)
    if (error) showToast(`เกิดข้อผิดพลาด: ${error}`, 'error')
    else { showToast('ย้ายงานกลับเข้า Job แล้ว', 'info'); onAction?.() }
  }

  const handleDelete = async (job: Job) => {
    if (confirmDeleteId !== job.id) { setConfirmDeleteId(job.id); return }
    setDeletingId(job.id); setConfirmDeleteId(null)
    const { error } = await deleteJob(job.id)
    setDeletingId(null)
    if (error) showToast(`ลบไม่ได้: ${error}`, 'error')
    else showToast('ลบงานแล้ว', 'info')
  }

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filterStatus !== 'all' && j.status !== filterStatus) return false
      if (dateFrom && j.created_at < dateFrom) return false
      if (dateTo && j.created_at > dateTo + 'T23:59:59') return false
      return true
    })
  }, [jobs, filterStatus, dateFrom, dateTo])

  const pendingCount = jobs.filter((j) => j.status === 'pending').length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Job</h1>
          <p className="text-sm text-gray-500 mt-0.5">ติดตามงาน · {pendingCount} งานที่ยังค้างอยู่</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 bg-pink-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-pink-700 transition-colors active:scale-95">
          {showForm ? '✕ ปิด' : '+ สร้างงาน'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <section className="bg-white rounded-2xl shadow-sm border border-pink-100 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-pink-700">สร้างงานใหม่</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">ชื่องาน *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="ระบุชื่องาน..." maxLength={100} required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">รายละเอียด</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="รายละเอียดเพิ่มเติม..." rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">รูปภาพ</label>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-pink-200 bg-pink-50 hover:bg-pink-100 rounded-xl py-4 flex flex-col items-center gap-1.5 transition-colors">
                <span className="text-2xl">📷</span>
                <span className="text-xs text-pink-600 font-medium">เพิ่มรูปภาพ</span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageChange} className="hidden" />
              {imagePreviews.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {imagePreviews.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                      <button type="button" onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={resetForm}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50">ยกเลิก</button>
              <button type="submit" disabled={creating || !title.trim()}
                className="flex-1 py-2.5 rounded-xl bg-pink-600 text-white font-bold text-sm disabled:opacity-50 hover:bg-pink-700 active:scale-95">
                {creating ? 'กำลังสร้าง...' : '✅ สร้างงาน'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Filters */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex gap-2">
          {(['all', 'pending', 'completed'] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all
                ${filterStatus === s ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'all' ? 'ทั้งหมด' : s === 'pending' ? '🔵 ค้างอยู่' : '✅ เสร็จแล้ว'}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-500">📅 ช่วงวันที่ (วันที่ 1 → ปัจจุบัน)</label>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(getFirstOfMonth()); setDateTo(getToday()) }}
                className="text-xs text-pink-500 hover:text-pink-700 font-medium">รีเซ็ต</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
            <span className="text-gray-400 font-medium text-sm flex-shrink-0">→</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
          </div>
        </div>
      </section>

      {/* Job list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-4xl mb-2">📋</p>
          <p className="text-gray-400 text-sm">ไม่มีงานที่ตรงกับเงื่อนไข</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => {
            const days = getDaysSince(job.created_at)
            const isCompleted = job.status === 'completed'
            return (
              <div key={job.id}
                className={`bg-white rounded-2xl shadow-sm border p-4 space-y-3 transition-all
                  ${isCompleted ? 'border-green-100 opacity-80' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-semibold text-gray-900 ${isCompleted ? 'line-through text-gray-400' : ''}`}>
                        {job.title}
                      </p>
                      {!isCompleted && <AgeBadge days={days} />}
                      {isCompleted && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✅ เสร็จสิ้น</span>
                      )}
                    </div>
                    {job.description && <p className="text-sm text-gray-500 mt-1">{job.description}</p>}
                    <p className="text-sm text-gray-500 mt-1">
                      📅 {formatDateRange(job.created_at, job.completed_at ?? null)}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => openEdit(job)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all">
                      ✏️
                    </button>
                    <button onClick={() => handleDelete(job)} disabled={deletingId === job.id}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                        ${confirmDeleteId === job.id ? 'bg-red-500 text-white animate-pulse' : 'bg-red-50 text-red-400 hover:bg-red-100'}`}>
                      {deletingId === job.id ? '...' : confirmDeleteId === job.id ? 'ยืนยัน?' : 'ลบ'}
                    </button>
                  </div>
                </div>

                {/* Images */}
                {job.images && job.images.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {job.images.slice(0, expandedImages === job.id ? undefined : 4).map((img) => (
                      <ZoomImage key={img.id} src={img.image_url}
                        className="w-14 h-14 rounded-lg object-cover border border-gray-100 hover:opacity-80" />
                    ))}
                    {job.images.length > 4 && expandedImages !== job.id && (
                      <button onClick={() => setExpandedImages(job.id)}
                        className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-medium border border-gray-200">
                        +{job.images.length - 4}
                      </button>
                    )}
                  </div>
                )}

                {/* Bottom action buttons */}
                <div className="flex gap-2">
                  {!isCompleted && (
                    <button onClick={() => handleComplete(job.id)} disabled={completingId === job.id}
                      className="flex-1 py-2.5 rounded-xl bg-green-50 text-green-700 border border-green-200 font-semibold text-sm hover:bg-green-100 transition-colors active:scale-95 disabled:opacity-50">
                      {completingId === job.id ? 'กำลังบันทึก...' : '✅ กดเสร็จสิ้น'}
                    </button>
                  )}
                  {isCompleted && (
                    <button onClick={() => handleRevert(job.id)} disabled={revertingId === job.id}
                      className="flex-1 py-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-sm hover:bg-blue-100 transition-colors active:scale-95 disabled:opacity-50">
                      {revertingId === job.id ? 'กำลังย้าย...' : '↩️ ย้ายเข้า Job'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">✏️ แก้ไขงาน</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">ชื่องาน *</label>
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={100}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">รายละเอียด</label>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingJob(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50">ยกเลิก</button>
              <button onClick={handleSaveEdit} disabled={saving || !editTitle.trim()}
                className="flex-1 py-3 rounded-xl bg-pink-600 text-white font-bold disabled:opacity-50 hover:bg-pink-700 active:scale-95">
                {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
