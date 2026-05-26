import { useState, useEffect, useMemo, useRef } from 'react'
import { useBranches } from '../hooks/useBranches'
import { useKioskUiOptions } from '../hooks/useKioskUiOptions'
import { useUiChangeHistory } from '../hooks/useUiChangeHistory'
import { showToast } from '../components/Toast'
import {
  extractBranchNumForQueue,
  sendChangeUICommand,
  CHANGE_UI_TIMEOUT_MS,
} from '../lib/printerCommandQueue'
import type { ChangeUIResult } from '../lib/printerCommandQueue'
import { defaultHistoryRangeThai } from '../lib/thaiDate'
import type { KioskUiOption, StoreGroup } from '../types'

const TIMEOUT_SEC = CHANGE_UI_TIMEOUT_MS / 1000
const defaultRange = defaultHistoryRangeThai()

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ChangeUI() {
  const { storeGroups, activeBranches: branches, loading: branchLoading } = useBranches()
  const {
    allOptions,
    loading: optionsLoading,
    activeForStoreGroup,
    create,
    update,
    deactivate,
    refresh: refreshOptions,
  } = useKioskUiOptions()

  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')

  const [uiSearch, setUiSearch] = useState('')
  const [selectedUiId, setSelectedUiId] = useState('')

  const [historyDateFrom, setHistoryDateFrom] = useState(defaultRange.from)
  const [historyDateTo, setHistoryDateTo] = useState(defaultRange.to)
  const [historyStoreGroup, setHistoryStoreGroup] = useState('')
  const [historySearch, setHistorySearch] = useState('')

  const { logs, loading: historyLoading, insertLog, refresh: refreshHistory } = useUiChangeHistory({
    dateFrom: historyDateFrom,
    dateTo: historyDateTo,
    storeGroupId: historyStoreGroup || undefined,
  })

  const [changingUiName, setChangingUiName] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [lastError, setLastError] = useState<ChangeUIResult | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const cancelRef = useRef({ cancelled: false })
  const warnedRef = useRef(false)

  const groupOptions = useMemo(
    () => (selectedGroup ? activeForStoreGroup(selectedGroup) : []),
    [selectedGroup, allOptions, activeForStoreGroup]
  )

  const filteredUiOptions = useMemo(
    () =>
      groupOptions.filter(
        (o) =>
          uiSearch.trim() === '' ||
          o.name.toLowerCase().includes(uiSearch.toLowerCase())
      ),
    [groupOptions, uiSearch]
  )

  const selectedUiOption = useMemo(
    () => groupOptions.find((o) => o.id === selectedUiId),
    [groupOptions, selectedUiId]
  )

  const filteredBranches = useMemo(
    () =>
      branches
        .filter((b) => b.store_group_id === selectedGroup)
        .filter(
          (b) =>
            branchSearch.trim() === '' ||
            b.name.toLowerCase().includes(branchSearch.toLowerCase())
        ),
    [branches, selectedGroup, branchSearch]
  )

  const selectedBranchObj = useMemo(
    () => branches.find((b) => b.id === selectedBranch),
    [branches, selectedBranch]
  )

  const selectedBranchNum = useMemo(() => {
    return selectedBranchObj ? extractBranchNumForQueue(selectedBranchObj.name) : null
  }, [selectedBranchObj])

  const filteredHistoryLogs = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return logs
    return logs.filter(
      (log) =>
        log.branch_name.toLowerCase().includes(q) ||
        log.ui_name.toLowerCase().includes(q)
    )
  }, [logs, historySearch])

  useEffect(() => {
    setSelectedBranch('')
    setBranchSearch('')
    setSelectedUiId('')
    setUiSearch('')
  }, [selectedGroup])

  useEffect(() => {
    if (!changingUiName) return
    const t0 = Date.now()
    setElapsedSec(0)
    warnedRef.current = false
    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000)
      setElapsedSec(sec)
      if (sec >= 30 && !warnedRef.current) {
        warnedRef.current = true
        showToast('ยังรอสาขา... หากเกิน 90 วินาทีจะหยุดอัตโนมัติ', 'warning')
      }
    }, 500)
    return () => clearInterval(interval)
  }, [changingUiName])

  const handleChangeUI = async () => {
    const uiName = selectedUiOption?.name?.trim()
    if (!uiName) {
      showToast('กรุณาเลือกชื่อ UI', 'warning')
      return
    }
    if (!selectedBranchNum) {
      showToast('ไม่พบเลขสาขา — ชื่อสาขาต้องขึ้นต้นด้วยตัวเลข', 'error')
      return
    }
    if (!selectedBranchObj) return

    cancelRef.current = { cancelled: false }
    setChangingUiName(uiName)
    setLastError(null)
    showToast(`กำลังเปลี่ยน UI "${uiName}" ที่สาขา ${selectedBranchNum}...`, 'info')

    try {
      const result = await sendChangeUICommand(selectedBranchNum, uiName, {
        signal: cancelRef.current,
      })

      if (result.ok) {
        const { error } = await insertLog({
          branch_id: selectedBranchObj.id,
          branch_name: selectedBranchObj.name,
          store_group_id: selectedBranchObj.store_group_id,
          ui_name: uiName,
        })
        if (error) showToast(`เปลี่ยนสำเร็จแต่บันทึกประวัติไม่ได้: ${error}`, 'warning')
        else refreshHistory()
        showToast(result.message, 'success')
        setLastError(null)
      } else {
        setLastError(result)
        showToast(result.message, 'error')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'ส่งคำสั่งไม่สำเร็จ'
      const err: ChangeUIResult = { ok: false, code: 'enqueue_failed', message: msg }
      setLastError(err)
      showToast(msg, 'error')
    } finally {
      setChangingUiName(null)
    }
  }

  const handleCancel = () => {
    cancelRef.current.cancelled = true
    setChangingUiName(null)
    setLastError({
      ok: false,
      code: 'cancelled',
      message: 'ยกเลิกการรอผลแล้ว — งานที่สาขาอาจยังดำเนินการอยู่',
    })
    showToast('ยกเลิกการรอแล้ว', 'info')
  }

  const resetHistoryFilters = () => {
    const range = defaultHistoryRangeThai()
    setHistoryDateFrom(range.from)
    setHistoryDateTo(range.to)
    setHistoryStoreGroup('')
    setHistorySearch('')
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">เปลี่ยน UI</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ส่งคำสั่งเปลี่ยนโฟลเดอร์ UI ไปเครื่องสาขาผ่าน printer_monitor
        </p>
      </div>

      {/* Branch selector */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">เลือกสาขา</h2>
        {branchLoading ? (
          <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">ประเภทร้าน</label>
              <div className="flex gap-2 flex-wrap">
                {storeGroups.map((sg: StoreGroup) => (
                  <button
                    key={sg.id}
                    type="button"
                    onClick={() => setSelectedGroup(sg.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95
                      ${selectedGroup === sg.id ? 'bg-pink-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {sg.name}
                  </button>
                ))}
                {storeGroups.length === 0 && (
                  <p className="text-sm text-gray-400 italic">ยังไม่มีประเภทร้าน</p>
                )}
              </div>
            </div>

            {selectedGroup && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 block">สาขา</label>
                <div className="relative">
                  <input
                    type="text"
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    placeholder="ค้นหาชื่อสาขา..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                  {branchSearch && (
                    <button
                      type="button"
                      onClick={() => setBranchSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs"
                    >
                      ✕
                    </button>
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
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* UI selection */}
      {selectedBranch && selectedGroup && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                เลือก UI
              </h2>
              <p className="text-xs text-amber-700 mt-1">
                ชื่อต้องตรงกับโฟลเดอร์ย่อยใน ui_rebuild_dir ที่เครื่องสาขา
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              ⚙️ ตั้งค่าชื่อ UI
            </button>
          </div>

          {optionsLoading ? (
            <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ) : groupOptions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-2">🎨</p>
              <p className="text-sm text-gray-400">
                ยังไม่มีชื่อ UI สำหรับประเภทร้านนี้ — กดตั้งค่าชื่อ UI เพื่อเพิ่ม
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 block">ชื่อ UI</label>
                <div className="relative">
                  <input
                    type="text"
                    value={uiSearch}
                    onChange={(e) => setUiSearch(e.target.value)}
                    placeholder="ค้นหาชื่อ UI..."
                    disabled={!!changingUiName}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:opacity-50"
                  />
                  {uiSearch && (
                    <button
                      type="button"
                      onClick={() => setUiSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {filteredUiOptions.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">ไม่พบชื่อ UI</p>
                ) : (
                  <select
                    value={selectedUiId}
                    onChange={(e) => setSelectedUiId(e.target.value)}
                    disabled={!!changingUiName}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white disabled:opacity-50"
                  >
                    <option value="">— เลือกชื่อ UI —</option>
                    {filteredUiOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="button"
                onClick={handleChangeUI}
                disabled={!!changingUiName || !selectedUiId || !selectedBranchNum}
                className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {changingUiName ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                    กำลังเปลี่ยน UI...
                  </>
                ) : (
                  <>🎨 เปลี่ยน UI</>
                )}
              </button>
            </div>
          )}

          {changingUiName && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-purple-50 border border-purple-100 rounded-xl">
              <p className="text-sm text-purple-800 flex-1">
                กำลังเปลี่ยน &quot;{changingUiName}&quot; ที่สาขา {selectedBranchNum}...
                ({elapsedSec}/{TIMEOUT_SEC} วินาที)
              </p>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
            </div>
          )}

          {lastError && !changingUiName && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1">
              <p className="text-sm font-bold text-red-800">ล้มเหลว</p>
              <p className="text-sm text-red-700">{lastError.message}</p>
              {lastError.commandId != null && (
                <p className="text-xs text-red-500">คำสั่ง #{lastError.commandId}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* History */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          ประวัติการเปลี่ยน UI
        </h2>

        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-gray-500 block mb-1">จากวันที่</label>
            <input
              type="date"
              value={historyDateFrom}
              onChange={(e) => setHistoryDateFrom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-gray-500 block mb-1">ถึงวันที่</label>
            <input
              type="date"
              value={historyDateTo}
              onChange={(e) => setHistoryDateTo(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-gray-500 block mb-1">ประเภทร้าน</label>
            <select
              value={historyStoreGroup}
              onChange={(e) => setHistoryStoreGroup(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
            >
              <option value="">ทั้งหมด</option>
              {storeGroups.map((sg) => (
                <option key={sg.id} value={sg.id}>
                  {sg.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={resetHistoryFilters}
              className="px-3 py-2 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500 block">ค้นหา</label>
          <div className="relative">
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="ค้นหาชื่อสาขาหรือชื่อ UI..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            {historySearch && (
              <button
                type="button"
                onClick={() => setHistorySearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {historyLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">ไม่มีประวัติในช่วงที่เลือก</p>
        ) : filteredHistoryLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">ไม่พบผลลัพธ์ที่ค้นหา</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filteredHistoryLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl text-sm"
              >
                <span className="text-xs text-gray-400 flex-shrink-0 w-28">
                  {formatDateTime(log.created_at)}
                </span>
                <span className="font-medium text-gray-800 flex-1 truncate">
                  {log.branch_name}
                </span>
                <span className="text-purple-700 font-semibold flex-shrink-0">{log.ui_name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {showSettings && (
        <UiSettingsModal
          storeGroups={storeGroups}
          allOptions={allOptions}
          initialStoreGroupId={selectedGroup || storeGroups[0]?.id || ''}
          onClose={() => setShowSettings(false)}
          onCreate={create}
          onUpdate={update}
          onDeactivate={deactivate}
          onRefresh={refreshOptions}
        />
      )}
    </div>
  )
}

function UiSettingsModal({
  storeGroups,
  allOptions,
  initialStoreGroupId,
  onClose,
  onCreate,
  onUpdate,
  onDeactivate,
  onRefresh,
}: {
  storeGroups: StoreGroup[]
  allOptions: KioskUiOption[]
  initialStoreGroupId: string
  onClose: () => void
  onCreate: (name: string, storeGroupId: string) => Promise<{ error: string | null }>
  onUpdate: (id: string, data: { name?: string }) => Promise<{ error: string | null }>
  onDeactivate: (id: string) => Promise<{ error: string | null }>
  onRefresh: () => void
}) {
  const [settingsGroupId, setSettingsGroupId] = useState(initialStoreGroupId)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null)

  const groupOptions = allOptions.filter((o) => o.store_group_id === settingsGroupId)
  const activeList = groupOptions.filter((o) => o.is_active)
  const inactiveList = groupOptions.filter((o) => !o.is_active)
  const currentGroupName = storeGroups.find((g) => g.id === settingsGroupId)?.name ?? ''

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !settingsGroupId) return
    setCreating(true)
    const { error } = await onCreate(newName, settingsGroupId)
    setCreating(false)
    if (error) showToast(`เพิ่มไม่ได้: ${error}`, 'error')
    else {
      showToast(`เพิ่ม "${newName.trim()}" ใน ${currentGroupName} สำเร็จ`, 'success')
      setNewName('')
      onRefresh()
    }
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return
    setSavingEdit(true)
    const { error } = await onUpdate(editingId, { name: editName })
    setSavingEdit(false)
    if (error) showToast(`แก้ไขไม่ได้: ${error}`, 'error')
    else {
      showToast('แก้ไขชื่อสำเร็จ', 'success')
      setEditingId(null)
      onRefresh()
    }
  }

  const handleDeactivate = async (opt: KioskUiOption) => {
    if (confirmDeactivateId !== opt.id) {
      setConfirmDeactivateId(opt.id)
      return
    }
    setConfirmDeactivateId(null)
    setDeactivatingId(opt.id)
    const { error } = await onDeactivate(opt.id)
    setDeactivatingId(null)
    if (error) showToast(`ปิดใช้งานไม่ได้: ${error}`, 'error')
    else {
      showToast(`ปิดใช้งาน "${opt.name}" แล้ว`, 'info')
      onRefresh()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">ตั้งค่าชื่อ UI</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pt-4">
          <label className="text-xs font-medium text-gray-500 mb-2 block">ประเภทร้าน</label>
          <div className="flex gap-2 flex-wrap">
            {storeGroups.map((sg) => (
              <button
                key={sg.id}
                type="button"
                onClick={() => {
                  setSettingsGroupId(sg.id)
                  setEditingId(null)
                  setConfirmDeactivateId(null)
                  setNewName('')
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${settingsGroupId === sg.id ? 'bg-pink-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {sg.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!settingsGroupId ? (
            <p className="text-sm text-gray-400 italic text-center py-4">เลือกประเภทร้านก่อน</p>
          ) : (
            <>
              <form onSubmit={handleCreate} className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`ชื่อโฟลเดอร์ UI (${currentGroupName})...`}
                  maxLength={100}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="px-4 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-pink-700"
                >
                  {creating ? '...' : '+ เพิ่ม'}
                </button>
              </form>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  ใช้งานอยู่ — {currentGroupName}
                </p>
                {activeList.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">ยังไม่มีรายการในประเภทร้านนี้</p>
                ) : (
                  activeList.map((opt) => (
                    <div
                      key={opt.id}
                      className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl"
                    >
                      {editingId === opt.id ? (
                        <>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={savingEdit || !editName.trim()}
                            className="text-xs font-bold text-pink-600 disabled:opacity-50"
                          >
                            บันทึก
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-400"
                          >
                            ยกเลิก
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-medium text-gray-800">{opt.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(opt.id)
                              setEditName(opt.name)
                            }}
                            className="text-xs text-pink-600 font-medium"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeactivate(opt)}
                            disabled={deactivatingId === opt.id}
                            className={`text-xs font-medium ${
                              confirmDeactivateId === opt.id
                                ? 'text-red-600'
                                : 'text-gray-400 hover:text-red-500'
                            }`}
                          >
                            {confirmDeactivateId === opt.id
                              ? 'ยืนยันปิด?'
                              : deactivatingId === opt.id
                                ? '...'
                                : 'ปิดใช้งาน'}
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              {inactiveList.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase">
                    ปิดใช้งานแล้ว — {currentGroupName}
                  </p>
                  {inactiveList.map((opt) => (
                    <p key={opt.id} className="text-sm text-gray-400 line-through px-3">
                      {opt.name}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}
