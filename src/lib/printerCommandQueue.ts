import { supabase } from './supabase'

export type CommandQueueStatus = 'pending' | 'done' | 'failed'

export interface CommandQueueResult {
  status: CommandQueueStatus | 'timeout'
  error_msg?: string | null
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

export async function waitForCommandResult(
  commandId: number,
  options?: { timeoutMs?: number; pollMs?: number }
): Promise<CommandQueueResult> {
  const timeoutMs = options?.timeoutMs ?? 120_000
  const pollMs = options?.pollMs ?? 2_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('printer_command_queue')
      .select('status, error_msg')
      .eq('id', commandId)
      .single()

    if (error) throw error

    const status = data.status as CommandQueueStatus
    if (status === 'done') return { status: 'done' }
    if (status === 'failed') {
      return { status: 'failed', error_msg: data.error_msg }
    }

    await new Promise((r) => setTimeout(r, pollMs))
  }

  return { status: 'timeout' }
}

/** ส่งคำสั่ง changeui แล้วรอผล — ใช้จากหน้า Stock */
export async function sendChangeUICommand(
  branchNum: string,
  productName: string
): Promise<{ ok: boolean; message: string }> {
  const commandId = await enqueuePrinterCommand(branchNum, 'changeui', [productName])
  const result = await waitForCommandResult(commandId)

  if (result.status === 'done') {
    return { ok: true, message: `เปลี่ยน UI "${productName}" สำเร็จ` }
  }
  if (result.status === 'timeout') {
    return {
      ok: false,
      message:
        `สาขา ${branchNum} ไม่ตอบสนอง — ตรวจสอบว่า printer_monitor กำลังทำงาน`,
    }
  }

  const raw = result.error_msg ?? 'ไม่ทราบสาเหตุ'
  const bracket = raw.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (bracket) {
    const detail = bracket[2]?.trim()
    return {
      ok: false,
      message: detail
        ? `ล้มเหลวขั้นตอน "${bracket[1]}": ${detail}`
        : `ล้มเหลวขั้นตอน "${bracket[1]}"`,
    }
  }

  return { ok: false, message: raw }
}
