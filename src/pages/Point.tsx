import { useState, useMemo } from 'react'
import { useLinePoints } from '../hooks/useLinePoints'
import { showToast } from '../components/Toast'
import { downloadAddPointExcel } from '../lib/exportAddPoint'
import { formatPhoneDisplay, sanitizePhoneInput } from '../lib/phone'
import type { LinePointQueue, LinePointStatus } from '../types'

const STATUS_LABELS: Record<LinePointStatus, string> = {
  pending: 'รอส่ง',
  exported: 'ส่งไฟล์แล้ว',
  uploaded: 'อัปโหลดแล้ว',
  success: 'สำเร็จ',
  failed: 'ล้มเหลว',
}

const STATUS_STYLES: Record<LinePointStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  exported: 'bg-blue-100 text-blue-800 border-blue-200',
  uploaded: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  success: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
}

type FilterTab = 'all' | LinePointStatus

const AMOUNT_PRESETS = [50, 60, 100, 120] as const

const FAIL_REASON_PRESETS = ['เบอร์โทรไม่ถูกต้อง'] as const
const FAIL_REASON_OTHER = '__other__'

function formatThaiDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

export function PointPage() {
  const {
    items,
    loading,
    pendingCount,
    exportedCount,
    createPoint,
    exportPending,
    markSuccess,
    markFailed,
    revertToPending,
  } = useLinePoints()

  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('pending')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [updating, setUpdating] = useState(false)
  const [failModalRow, setFailModalRow] = useState<LinePointQueue | null>(null)
  const [failReasonChoice, setFailReasonChoice] = useState('')
  const [failReasonOther, setFailReasonOther] = useState('')
  const [failSubmitting, setFailSubmitting] = useState(false)

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((i) => i.status === filter)
  }, [items, filter])

  const exportedItems = useMemo(
    () => items.filter((i) => i.status === 'exported'),
    [items],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount.replace(/,/g, ''))
    setCreating(true)
    const { error, billingId } = await createPoint(phone, amt)
    setCreating(false)
    if (error) showToast(error, 'error')
    else {
      showToast(`บันทึกแล้ว เลขบิล ${billingId}`, 'success')
      setPhone('')
      setAmount('')
    }
  }

  const handleExportExcel = async () => {
    setExporting(true)
    const { error, rows } = await exportPending()
    setExporting(false)
    if (error) {
      showToast(error, 'warning')
      return
    }
    if (!rows?.length) return

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const filename = `add-point-${date}.xlsx`
    try {
      await downloadAddPointExcel(rows, filename)
      showToast(`ดาวน์โหลด ${rows.length} รายการ — อัปโหลดที่ OA Plus แล้วกดยืนยันสำเร็จ`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้างไฟล์ไม่ได้', 'error')
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllExported = () => {
    setSelectedIds(new Set(exportedItems.map((i) => i.id)))
  }

  const handleMarkSuccess = async (ids: string[]) => {
    setUpdating(true)
    const { error } = await markSuccess(ids)
    setUpdating(false)
    if (error) showToast(error, 'error')
    else {
      showToast(`ยืนยันสำเร็จ ${ids.length} รายการ`, 'success')
      setSelectedIds(new Set())
    }
  }

  const openFailModal = (row: LinePointQueue) => {
    const prev = row.error_message?.trim() ?? ''
    const isPreset = FAIL_REASON_PRESETS.includes(prev as (typeof FAIL_REASON_PRESETS)[number])
    setFailModalRow(row)
    setFailReasonChoice(isPreset ? prev : prev ? FAIL_REASON_OTHER : '')
    setFailReasonOther(isPreset ? '' : prev)
    setFailSubmitting(false)
  }

  const closeFailModal = () => {
    setFailModalRow(null)
    setFailReasonChoice('')
    setFailReasonOther('')
  }

  const resolveFailMessage = (): string => {
    if (failReasonChoice === FAIL_REASON_OTHER) return failReasonOther.trim()
    return failReasonChoice.trim()
  }

  const confirmFail = async () => {
    if (!failModalRow) return
    const msg = resolveFailMessage()
    if (!msg) {
      showToast('กรุณาเลือกหรือระบุเหตุผล', 'warning')
      return
    }
    setFailSubmitting(true)
    const { error } = await markFailed(failModalRow.id, msg)
    setFailSubmitting(false)
    if (error) showToast(error, 'error')
    else {
      showToast('บันทึกสถานะล้มเหลว', 'info')
      closeFailModal()
    }
  }

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const s of Object.keys(STATUS_LABELS) as LinePointStatus[]) {
      c[s] = items.filter((i) => i.status === s).length
    }
    return c
  }, [items])

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span>➕</span> +Point
        </h1>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
            <div className="flex gap-2">
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                maxLength={10}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                onPaste={(e) => {
                  e.preventDefault()
                  setPhone(sanitizePhoneInput(e.clipboardData.getData('text')))
                }}
                placeholder="0814052604"
                className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-3 text-base font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-pink-400"
                required
              />
              <button
                type="button"
                onClick={() => setPhone('')}
                disabled={!phone}
                className="flex-shrink-0 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 text-sm font-semibold hover:bg-gray-100 active:scale-95 disabled:opacity-40"
                aria-label="ลบเบอร์ในช่อง"
              >
                ลบ
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ยอดเงิน (บาท)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-pink-400"
              required
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className={`flex-1 min-w-[4rem] py-2 rounded-xl text-sm font-semibold border transition-colors
                    ${amount === String(preset)
                      ? 'bg-pink-600 text-white border-pink-600'
                      : 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100'}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold disabled:opacity-50"
          >
            {creating ? 'กำลังบันทึก…' : 'บันทึกรายการ'}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">ส่งเข้า LINE</h2>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || pendingCount === 0}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-40"
          >
            {exporting ? 'กำลังสร้างไฟล์…' : `ดาวน์โหลด Excel (${pendingCount})`}
          </button>
        </div>
        {exportedCount > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={selectAllExported}
              className="text-xs text-pink-600 font-medium"
            >
              เลือกรอยืนยันทั้งหมด ({exportedCount})
            </button>
            <button
              type="button"
              disabled={updating || selectedIds.size === 0}
              onClick={() => handleMarkSuccess([...selectedIds])}
              className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-40"
            >
              ยืนยันสำเร็จ ({selectedIds.size})
            </button>
            <button
              type="button"
              disabled={updating || exportedCount === 0}
              onClick={() => handleMarkSuccess(exportedItems.map((i) => i.id))}
              className="px-3 py-1.5 rounded-lg border border-green-600 text-green-700 text-xs font-semibold disabled:opacity-40"
            >
              ยืนยันทั้งชุดที่ส่งไฟล์แล้ว
            </button>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-100 p-2 gap-1">
          {(['all', 'pending', 'exported', 'success', 'failed'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                ${filter === tab ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {tab === 'all' ? 'ทั้งหมด' : STATUS_LABELS[tab as LinePointStatus]} ({tabCounts[tab] ?? 0})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">กำลังโหลด…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">ไม่มีรายการ</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((row) => (
              <li key={row.id} className="p-4 flex gap-3 items-start">
                {row.status === 'exported' && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelect(row.id)}
                    className="mt-1 w-4 h-4 accent-pink-600"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-gray-800">{row.billing_id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[row.status]}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">
                    {formatPhoneDisplay(row.phone)} · {Number(row.amount_baht).toLocaleString('th-TH')} บาท
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatThaiDateTime(row.created_at)}</p>
                  {row.error_message && (
                    <p className="text-xs text-red-600 mt-1">{row.error_message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {row.status === 'exported' && (
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => handleMarkSuccess([row.id])}
                      className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 font-medium"
                    >
                      สำเร็จ
                    </button>
                  )}
                  {(row.status === 'pending' || row.status === 'exported') && (
                    <button
                      type="button"
                      onClick={() => openFailModal(row)}
                      className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600"
                    >
                      ล้มเหลว
                    </button>
                  )}
                  {(row.status === 'exported' || row.status === 'failed') && (
                    <button
                      type="button"
                      onClick={async () => {
                        const { error } = await revertToPending(row.id)
                        if (error) showToast(error, 'error')
                        else showToast('คืนสถานะเป็นรอส่ง', 'info')
                      }}
                      className="text-xs px-2 py-1 rounded-lg text-gray-500"
                    >
                      คืนรอส่ง
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {failModalRow && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={closeFailModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-red-500 to-rose-600 px-5 py-4 text-white">
              <p className="text-2xl mb-1">⚠️</p>
              <h3 className="font-bold text-lg">บันทึกสถานะล้มเหลว</h3>
              <p className="text-sm text-white/90 mt-1 font-mono">{failModalRow.billing_id}</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700">
                {formatPhoneDisplay(failModalRow.phone)}
                {' · '}
                {Number(failModalRow.amount_baht).toLocaleString('th-TH')} บาท
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">เหตุผล</p>
                <div className="space-y-2">
                  {FAIL_REASON_PRESETS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors
                        ${failReasonChoice === reason
                          ? 'border-red-400 bg-red-50 ring-1 ring-red-200'
                          : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <input
                        type="radio"
                        name="fail-reason"
                        checked={failReasonChoice === reason}
                        onChange={() => setFailReasonChoice(reason)}
                        className="accent-red-600 w-4 h-4"
                      />
                      <span className="text-sm text-gray-800">{reason}</span>
                    </label>
                  ))}
                  <label
                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors
                      ${failReasonChoice === FAIL_REASON_OTHER
                        ? 'border-red-400 bg-red-50 ring-1 ring-red-200'
                        : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <input
                      type="radio"
                      name="fail-reason"
                      checked={failReasonChoice === FAIL_REASON_OTHER}
                      onChange={() => setFailReasonChoice(FAIL_REASON_OTHER)}
                      className="accent-red-600 w-4 h-4 mt-0.5"
                    />
                    <span className="text-sm text-gray-800 flex-1">อื่นๆ</span>
                  </label>
                  {failReasonChoice === FAIL_REASON_OTHER && (
                    <input
                      type="text"
                      value={failReasonOther}
                      onChange={(e) => setFailReasonOther(e.target.value)}
                      placeholder="ระบุเหตุผลเพิ่มเติม"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                      autoFocus
                    />
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeFailModal}
                  disabled={failSubmitting}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={confirmFail}
                  disabled={failSubmitting}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {failSubmitting ? 'กำลังบันทึก…' : 'ยืนยันล้มเหลว'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
