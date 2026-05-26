import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { thaiDayEndIso, thaiDayStartIso } from '../lib/thaiDate'
import type { UiChangeLog } from '../types'

export interface UiHistoryFilters {
  dateFrom?: string
  dateTo?: string
  storeGroupId?: string
}

export function useUiChangeHistory(filters: UiHistoryFilters) {
  const [logs, setLogs] = useState<UiChangeLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('ui_change_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filters.dateFrom) {
      q = q.gte('created_at', thaiDayStartIso(filters.dateFrom))
    }
    if (filters.dateTo) {
      q = q.lte('created_at', thaiDayEndIso(filters.dateTo))
    }
    if (filters.storeGroupId) {
      q = q.eq('store_group_id', filters.storeGroupId)
    }

    const { data, error } = await q
    if (!error && data) setLogs(data as UiChangeLog[])
    else setLogs([])
    setLoading(false)
  }, [filters.dateFrom, filters.dateTo, filters.storeGroupId])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const insertLog = async (entry: {
    branch_id: string
    branch_name: string
    store_group_id: string
    ui_name: string
  }) => {
    const { error } = await supabase.from('ui_change_log').insert(entry)
    if (!error) await fetchLogs()
    return { error: error?.message ?? null }
  }

  return { logs, loading, refresh: fetchLogs, insertLog }
}
