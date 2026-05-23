import { useState, useCallback } from 'react'
import { fetchServiceRows, type ServiceRow } from '../lib/serviceReport'

export type { ServiceRow }

export function useServiceReport() {
  const [rows, setRows] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterDays, setFilterDays] = useState<number | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchServiceRows())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }, [])

  const filteredRows = filterDays == null
    ? rows
    : rows.filter((r) => r.days_remaining <= filterDays)

  return { rows: filteredRows, allRows: rows, loading, error, filterDays, setFilterDays, fetch }
}
