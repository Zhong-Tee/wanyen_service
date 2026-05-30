import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useStock } from './useStock'
import type { Delivery, DeliveryStatus } from '../types'

export function useDeliveries() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const { addStockItem } = useStock()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('deliveries')
      .select('*, branch:branches(*), items:delivery_items(*, product:products(*))')
      .order('created_at', { ascending: false })
    if (data) setDeliveries(data as Delivery[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel('deliveries-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_items' }, () => fetchAll())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  const createDelivery = async (params: {
    to_branch_id: string
    tracking_number?: string
    notes?: string
    items: { product_id: string; quantity: number }[]
  }) => {
    const { data, error } = await supabase
      .from('deliveries')
      .insert({
        to_branch_id: params.to_branch_id,
        tracking_number: params.tracking_number?.trim() || null,
        notes: params.notes?.trim() || null,
      })
      .select()
      .single()

    if (error || !data) return { error: error?.message ?? 'สร้างรายการจัดส่งไม่ได้' }

    const itemRows = params.items.map((i) => ({ delivery_id: data.id, product_id: i.product_id, quantity: i.quantity }))
    if (itemRows.length > 0) {
      const { error: itemErr } = await supabase.from('delivery_items').insert(itemRows)
      if (itemErr) return { error: itemErr.message }
    }

    fetchAll()
    return { error: null }
  }

  const updateStatus = async (id: string, status: DeliveryStatus) => {
    const updates: Record<string, string> = { status }
    if (status === 'จัดส่งแล้ว') updates.shipped_at = new Date().toISOString()
    if (status === 'ได้รับแล้ว') updates.received_at = new Date().toISOString()

    const { error } = await supabase.from('deliveries').update(updates).eq('id', id)
    if (error) return { error: error.message }

    // Auto stock-in when received
    if (status === 'ได้รับแล้ว') {
      const delivery = deliveries.find((d) => d.id === id)
      if (delivery?.items && delivery.to_branch_id) {
        for (const item of delivery.items) {
          await addStockItem(delivery.to_branch_id, item.product_id, item.quantity)
        }
      }
    }

    fetchAll()
    return { error: null }
  }

  const updateTracking = async (id: string, tracking_number: string) => {
    const { error } = await supabase.from('deliveries').update({ tracking_number: tracking_number.trim() || null }).eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const updateToBranch = async (id: string, to_branch_id: string) => {
    const { error } = await supabase.from('deliveries').update({ to_branch_id }).eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const updateDeliveryItems = async (
    deliveryId: string,
    items: { product_id: string; quantity: number }[],
  ) => {
    const { error: delErr } = await supabase.from('delivery_items').delete().eq('delivery_id', deliveryId)
    if (delErr) return { error: delErr.message }

    if (items.length > 0) {
      const itemRows = items.map((i) => ({ delivery_id: deliveryId, product_id: i.product_id, quantity: i.quantity }))
      const { error: insErr } = await supabase.from('delivery_items').insert(itemRows)
      if (insErr) return { error: insErr.message }
    }

    fetchAll()
    return { error: null }
  }

  const deleteDelivery = async (id: string) => {
    const { error } = await supabase.from('deliveries').delete().eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  return { deliveries, loading, refresh: fetchAll, createDelivery, updateStatus, updateTracking, updateToBranch, updateDeliveryItems, deleteDelivery }
}
