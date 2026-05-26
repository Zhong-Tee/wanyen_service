import { supabase } from './supabase'

export type CommandQueueStatus = 'pending' | 'done' | 'failed'

export const CHANGE_UI_TIMEOUT_MS = 90_000
export const CHANGE_UI_POLL_MS = 2_000

export interface CommandQueueResult {
  status: CommandQueueStatus | 'timeout' | 'cancelled'
  error_msg?: string | null
  elapsedMs?: number
  neverPickedUp?: boolean
}

export type ChangeUIErrorCode =
  | 'timeout_offline'
  | 'timeout_slow'
  | 'step_failed'
  | 'enqueue_failed'
  | 'cancelled'
  | 'validation'

export interface ChangeUIResult {
  ok: boolean
  message: string
  code?: ChangeUIErrorCode
  step?: string
  commandId?: number
  elapsedMs?: number
}

/** ขั้นตอนเปลี่ยน UI — สอดคล้องกับ printer_monitor.py CHANGE_UI_STEP_LABELS */
const CHANGE_UI_STEP_LABELS: Record<string, string> = {
  close_app: 'ปิดโปรแกรม',
  find_ui: 'ค้นหาโฟลเดอร์ UI',
  copy_ui: 'คัดลอกไฟล์',
  start_app: 'เปิดโปรแกรม',
  config: 'ตั้งค่า',
  ตั้งค่า: 'ตั้งค่า',
}

const CHANGE_UI_STEP_HINTS: Record<string, string> = {
  find_ui: 'ตรวจชื่อโฟลเดอร์ใน ui_rebuild_dir ให้ตรงกับที่ตั้งค่า',
  copy_ui: 'ตรวจพื้นที่ดิสก์และสิทธิ์เขียนโฟลเดอร์โปรแกรม',
  start_app: 'ตรวจว่า st_sticker.exe เปิดได้ที่เครื่องสาขา',
  close_app: 'ตรวจว่าปิด st_sticker.exe ได้ (อาจค้าง process)',
  config: 'ตรวจ kiosk.app_dir ใน config.json ที่เครื่องสาขา',
}

/** เลขสาขานำหน้าจากชื่อ เช่น "100 B2S RBS" → "100" (คง leading zero ถ้ามี) */
export function extractBranchNumForQueue(branchName: string): string | null {
  return branchName.trim().match(/^(\d+)/)?.[1] ?? null
}

export async function enqueuePrinterCommand(
  branchId: string,
  command: string,
  args: (number | string)[]
): Promise<number> {
  const { data, error } = await supabase
    .from('printer_command_queue')
    .insert({
      branch_id: branchId,
      command,
      args,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id as number
}

export async function markCommandFailed(
  commandId: number,
  errorMsg: string
): Promise<void> {
  const { error } = await supabase
    .from('printer_command_queue')
    .update({
      status: 'failed',
      error_msg: errorMsg,
      processed_at: new Date().toISOString(),
    })
    .eq('id', commandId)
    .eq('status', 'pending')

  if (error) throw error
}

export async function waitForCommandResult(
  commandId: number,
  options?: {
    timeoutMs?: number
    pollMs?: number
    signal?: { cancelled: boolean }
  }
): Promise<CommandQueueResult> {
  const timeoutMs = options?.timeoutMs ?? CHANGE_UI_TIMEOUT_MS
  const pollMs = options?.pollMs ?? CHANGE_UI_POLL_MS
  const start = Date.now()
  const deadline = start + timeoutMs

  while (Date.now() < deadline) {
    if (options?.signal?.cancelled) {
      return { status: 'cancelled', elapsedMs: Date.now() - start }
    }

    const { data, error } = await supabase
      .from('printer_command_queue')
      .select('status, error_msg, created_at, processed_at')
      .eq('id', commandId)
      .single()

    if (error) throw error

    const status = data.status as CommandQueueStatus
    if (status === 'done') {
      return { status: 'done', elapsedMs: Date.now() - start }
    }
    if (status === 'failed') {
      return {
        status: 'failed',
        error_msg: data.error_msg,
        elapsedMs: Date.now() - start,
      }
    }

    await new Promise((r) => setTimeout(r, pollMs))
  }

  const { data: last } = await supabase
    .from('printer_command_queue')
    .select('status, processed_at')
    .eq('id', commandId)
    .single()

  const neverPickedUp =
    last?.status === 'pending' && !last?.processed_at

  return {
    status: 'timeout',
    elapsedMs: Date.now() - start,
    neverPickedUp,
  }
}

function parseStepFromError(raw: string): { stepKey: string; stepLabel: string; detail: string } {
  const bracket = raw.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (bracket) {
    const stepKey = bracket[1]
    const stepLabel = CHANGE_UI_STEP_LABELS[stepKey] ?? stepKey
    return { stepKey, stepLabel, detail: bracket[2]?.trim() ?? '' }
  }
  return { stepKey: '', stepLabel: '', detail: raw }
}

export function formatChangeUIError(params: {
  branchNum: string
  uiFolderName: string
  result: CommandQueueResult
  commandId?: number
}): ChangeUIResult {
  const { branchNum, uiFolderName, result, commandId } = params
  const timeoutSec = CHANGE_UI_TIMEOUT_MS / 1000

  if (result.status === 'cancelled') {
    return {
      ok: false,
      code: 'cancelled',
      message: 'ยกเลิกการรอผลแล้ว — งานที่สาขาอาจยังดำเนินการอยู่',
      commandId,
      elapsedMs: result.elapsedMs,
    }
  }

  if (result.status === 'timeout') {
    const code: ChangeUIErrorCode = result.neverPickedUp
      ? 'timeout_offline'
      : 'timeout_slow'
    const message = result.neverPickedUp
      ? `ล้มเหลว: หมดเวลา ${timeoutSec} วินาที — สาขา ${branchNum} ไม่รับคำสั่ง ตรวจว่า printer_monitor ทำงาน และ branch_id ใน config.json ตรงเลขสาขา`
      : `ล้มเหลว: หมดเวลา ${timeoutSec} วินาที — สาขาอาจกำลังคัดลอกไฟล์ UI "${uiFolderName}" ช้า ลองใหม่หรือตรวจ log ที่เครื่องสาขา`
    return { ok: false, code, message, commandId, elapsedMs: result.elapsedMs }
  }

  if (result.status === 'failed') {
    const raw = result.error_msg ?? 'ไม่ทราบสาเหตุ'
    const { stepKey, stepLabel, detail } = parseStepFromError(raw)
    const hint = stepKey ? CHANGE_UI_STEP_HINTS[stepKey] : undefined
    const message = stepLabel
      ? detail
        ? `ล้มเหลวขั้นตอน «${stepLabel}»: ${detail}${hint ? ` (${hint})` : ''}`
        : `ล้มเหลวขั้นตอน «${stepLabel}»${hint ? ` (${hint})` : ''}`
      : raw
    return {
      ok: false,
      code: 'step_failed',
      step: stepKey || stepLabel,
      message,
      commandId,
      elapsedMs: result.elapsedMs,
    }
  }

  return {
    ok: false,
    message: 'ไม่ทราบสถานะคำสั่ง',
    commandId,
    elapsedMs: result.elapsedMs,
  }
}

/** ส่งคำสั่ง changeui แล้วรอผล — ใช้จากหน้า ChangeUI */
export async function sendChangeUICommand(
  branchNum: string,
  uiFolderName: string,
  options?: { signal?: { cancelled: boolean } }
): Promise<ChangeUIResult> {
  const name = uiFolderName.trim()
  if (!name) {
    return { ok: false, code: 'validation', message: 'กรุณาเลือกชื่อ UI' }
  }
  if (!branchNum.trim()) {
    return {
      ok: false,
      code: 'validation',
      message: 'ไม่พบเลขสาขา — ชื่อสาขาต้องขึ้นต้นด้วยตัวเลข',
    }
  }

  let commandId: number
  try {
    commandId = await enqueuePrinterCommand(branchNum, 'changeui', [name])
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'
    return { ok: false, code: 'enqueue_failed', message: `ส่งคำสั่งเข้าคิวไม่ได้: ${msg}` }
  }

  const pollResult = await waitForCommandResult(commandId, {
    timeoutMs: CHANGE_UI_TIMEOUT_MS,
    pollMs: CHANGE_UI_POLL_MS,
    signal: options?.signal,
  })

  if (pollResult.status === 'done') {
    return {
      ok: true,
      message: `เปลี่ยน UI "${name}" สำเร็จ`,
      commandId,
      elapsedMs: pollResult.elapsedMs,
    }
  }

  if (pollResult.status === 'cancelled') {
    return formatChangeUIError({ branchNum, uiFolderName: name, result: pollResult, commandId })
  }

  if (pollResult.status === 'timeout') {
    try {
      await markCommandFailed(
        commandId,
        `[timeout] หมดเวลารอผลจากสาขา ${branchNum} (${CHANGE_UI_TIMEOUT_MS / 1000} วินาที)`
      )
    } catch {
      /* คิวอาจถูกอัปเดตโดย monitor แล้ว */
    }
  }

  return formatChangeUIError({ branchNum, uiFolderName: name, result: pollResult, commandId })
}
