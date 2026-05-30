import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { parseBranchCsv, buildBranchCsvUpdate } from '../lib/branchCsv'
import type { StoreGroup, Branch } from '../types'

export function useBranches() {
  const [storeGroups, setStoreGroups] = useState<StoreGroup[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [sgRes, brRes] = await Promise.all([
      supabase.from('store_groups').select('*').order('name'),
      supabase.from('branches').select('*, store_group:store_groups(*)').order('name'),
    ])
    if (sgRes.data) setStoreGroups(sgRes.data)
    if (brRes.data) setBranches(brRes.data as Branch[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const createStoreGroup = async (name: string) => {
    const { error } = await supabase.from('store_groups').insert({ name: name.trim().toUpperCase() })
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const updateStoreGroup = async (id: string, name: string) => {
    const { error } = await supabase.from('store_groups').update({ name: name.trim().toUpperCase() }).eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const deleteStoreGroup = async (id: string) => {
    const { error } = await supabase.from('store_groups').delete().eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const createBranch = async (data: { store_group_id: string; name: string; address?: string; phone?: string }) => {
    const { error } = await supabase.from('branches').insert({
      store_group_id: data.store_group_id,
      name: data.name.trim(),
      address: data.address?.trim() || null,
      phone: data.phone?.trim() || null,
    })
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const updateBranch = async (id: string, data: Partial<Pick<Branch, 'name' | 'address' | 'phone' | 'store_group_id' | 'rent' | 'gp_percent' | 'kiosk_sim_phone' | 'sim_code' | 'sim_expiry_date'>>) => {
    const { error } = await supabase.from('branches').update(data).eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const toggleBranch = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from('branches').update({ is_active: isActive }).eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const deleteBranch = async (id: string) => {
    const { error } = await supabase.from('branches').delete().eq('id', id)
    if (!error) fetchAll()
    return { error: error?.message ?? null }
  }

  const importBranchesFromCsv = async (file: File) => {
    const text = await file.text()
    const { rows, errors: parseErrors } = parseBranchCsv(text)
    if (parseErrors.length > 0) return { updated: 0, skipped: 0, errors: parseErrors }

    const branchIds = new Set(branches.map((b) => b.id))
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const row of rows) {
      if (!branchIds.has(row.id)) {
        errors.push(`แถว ${row.line}: ไม่พบสาขา id "${row.id}"`)
        skipped++
        continue
      }

      const { data, errors: rowErrors } = buildBranchCsvUpdate(row, storeGroups)
      errors.push(...rowErrors)
      if (rowErrors.length > 0) {
        skipped++
        continue
      }

      if (Object.keys(data).length === 0) {
        skipped++
        continue
      }

      const { error } = await supabase.from('branches').update(data).eq('id', row.id)
      if (error) {
        errors.push(`แถว ${row.line}: ${error.message}`)
        skipped++
      } else {
        updated++
      }
    }

    if (updated > 0) await fetchAll()
    return { updated, skipped, errors }
  }

  const activeBranches = branches.filter((b) => b.is_active)

  return {
    storeGroups,
    branches,
    activeBranches,
    loading,
    refresh: fetchAll,
    createStoreGroup,
    updateStoreGroup,
    deleteStoreGroup,
    createBranch,
    updateBranch,
    toggleBranch,
    deleteBranch,
    importBranchesFromCsv,
  }
}
