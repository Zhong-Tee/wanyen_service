import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { billingIdDatePrefix, formatBillingId, parseBillingSequence } from '../lib/billingId'
import { normalizeThaiPhone } from '../lib/phone'
import type { LinePointQueue, LinePointStatus } from '../types'

async function nextBillingId(): Promise<string> {
  const prefix = billingIdDatePrefix()
  const { data, error } = await supabase
    .from('line_point_queue')
    .select('billing_id')
    .like('billing_id', `${prefix}-%`)
    .order('billing_id', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)

  let maxSeq = 0
  for (const row of data ?? []) {
    const seq = parseBillingSequence(row.billing_id, prefix)
    if (seq !== null && seq > maxSeq) maxSeq = seq
  }
  return formatBillingId(prefix, maxSeq + 1)
}

export function useLinePoints() {
  const [items, setItems] = useState<LinePointQueue[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('line_point_queue')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) setItems(data as LinePointQueue[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('line-point-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_point_queue' }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  const createPoint = async (phoneRaw: string, amountBaht: number) => {
    const phone = normalizeThaiPhone(phoneRaw)
    if (!phone) return { error: 'เบอร์โทรไม่ถูกต้อง (ต้องเป็น 10 หลัก ขึ้นต้น 0)' }
    if (!Number.isFinite(amountBaht) || amountBaht <= 0) {
      return { error: 'ยอดเงินต้องมากกว่า 0' }
    }

    let billingId: string
    try {
      billingId = await nextBillingId()
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'สร้างเลขบิลไม่ได้' }
    }

    const { error } = await supabase.from('line_point_queue').insert({
      billing_id: billingId,
      phone,
      amount_baht: amountBaht,
      status: 'pending',
    })

    if (error) {
      if (error.code === '23505') {
        return { error: 'เลขบิลซ้ำ กรุณาลองใหม่' }
      }
      return { error: error.message }
    }

    await fetchAll()
    return { error: null, billingId }
  }

  const exportPending = async (): Promise<{ error: string | null; rows?: LinePointQueue[]; batchId?: string }> => {
    const pending = items.filter((i) => i.status === 'pending')
    if (pending.length === 0) return { error: 'ไม่มีรายการรอส่ง' }

    const batchId = crypto.randomUUID()
    const now = new Date().toISOString()
    const ids = pending.map((i) => i.id)

    const { error } = await supabase
      .from('line_point_queue')
      .update({ status: 'exported', batch_id: batchId, exported_at: now })
      .in('id', ids)

    if (error) return { error: error.message }

    await fetchAll()
    const rows = pending.map((r) => ({
      ...r,
      status: 'exported' as LinePointStatus,
      batch_id: batchId,
      exported_at: now,
    }))
    return { error: null, rows, batchId }
  }

  const markSuccess = async (ids: string[]) => {
    if (ids.length === 0) return { error: 'ไม่มีรายการที่เลือก' }
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('line_point_queue')
      .update({ status: 'success', processed_at: now, error_message: null })
      .in('id', ids)
      .in('status', ['exported', 'uploaded'])

    if (error) return { error: error.message }
    await fetchAll()
    return { error: null }
  }

  const markFailed = async (id: string, message: string) => {
    const { error } = await supabase
      .from('line_point_queue')
      .update({
        status: 'failed',
        error_message: message.trim() || 'ล้มเหลว',
        processed_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) return { error: error.message }
    await fetchAll()
    return { error: null }
  }

  const revertToPending = async (id: string) => {
    const { error } = await supabase
      .from('line_point_queue')
      .update({
        status: 'pending',
        batch_id: null,
        exported_at: null,
        processed_at: null,
        error_message: null,
      })
      .eq('id', id)
      .in('status', ['exported', 'failed'])

    if (error) return { error: error.message }
    await fetchAll()
    return { error: null }
  }

  const pendingCount = items.filter((i) => i.status === 'pending').length
  const exportedCount = items.filter((i) => i.status === 'exported').length

  return {
    items,
    loading,
    pendingCount,
    exportedCount,
    createPoint,
    exportPending,
    markSuccess,
    markFailed,
    revertToPending,
    refetch: fetchAll,
  }
}
