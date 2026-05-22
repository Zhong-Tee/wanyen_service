import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
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

  const updateBranch = async (id: string, data: Partial<Pick<Branch, 'name' | 'address' | 'phone' | 'store_group_id' | 'rent' | 'gp_percent'>>) => {
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
  }
}
