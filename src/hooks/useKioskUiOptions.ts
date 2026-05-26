import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { KioskUiOption } from '../types'

export function useKioskUiOptions() {
  const [allOptions, setAllOptions] = useState<KioskUiOption[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('kiosk_ui_options')
      .select('*, store_group:store_groups(*)')
      .order('sort_order')
      .order('name')

    if (!error && data) {
      setAllOptions(data as KioskUiOption[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const activeForStoreGroup = (storeGroupId: string) =>
    allOptions.filter((o) => o.is_active && o.store_group_id === storeGroupId)

  const allForStoreGroup = (storeGroupId: string) =>
    allOptions.filter((o) => o.store_group_id === storeGroupId)

  const create = async (name: string, storeGroupId: string, sortOrder = 0) => {
    const trimmed = name.trim()
    const { error } = await supabase.from('kiosk_ui_options').insert({
      name: trimmed,
      store_group_id: storeGroupId,
      sort_order: sortOrder,
      is_active: true,
    })
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const update = async (id: string, data: { name?: string; sort_order?: number }) => {
    const payload: { name?: string; sort_order?: number } = {}
    if (data.name !== undefined) payload.name = data.name.trim()
    if (data.sort_order !== undefined) payload.sort_order = data.sort_order
    const { error } = await supabase.from('kiosk_ui_options').update(payload).eq('id', id)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const deactivate = async (id: string) => {
    const { error } = await supabase
      .from('kiosk_ui_options')
      .update({ is_active: false })
      .eq('id', id)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  return {
    allOptions,
    loading,
    refresh: fetchAll,
    activeForStoreGroup,
    allForStoreGroup,
    create,
    update,
    deactivate,
  }
}
