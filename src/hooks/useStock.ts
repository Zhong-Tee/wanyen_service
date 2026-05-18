import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { BranchStock, StockStatus } from '../types'

export function useStock() {
  const [stock, setStock] = useState<BranchStock[]>([])
  const [loading, setLoading] = useState(false)

  const fetchByBranch = useCallback(async (branchId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('branch_stock')
      .select('*, product:products(*)')
      .eq('branch_id', branchId)
      .order('updated_at', { ascending: false })
    if (data) setStock(data as BranchStock[])
    setLoading(false)
  }, [])

  const fetchActiveByBranch = useCallback(async (branchId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('branch_stock')
      .select('*, product:products(*)')
      .eq('branch_id', branchId)
      .eq('status', 'กำลังใช้')
      .order('updated_at', { ascending: false })
    if (data) setStock(data as BranchStock[])
    setLoading(false)
  }, [])

  // Update status by stock item id (supports duplicate products)
  const setStatus = async (stockId: string, status: StockStatus, quantity?: number) => {
    if (status === 'หมด') {
      const { error } = await supabase.from('branch_stock').delete().eq('id', stockId)
      return { error: error?.message ?? null }
    }
    const { error } = await supabase
      .from('branch_stock')
      .update({ status, quantity: quantity ?? 0, updated_at: new Date().toISOString() })
      .eq('id', stockId)
    return { error: error?.message ?? null }
  }

  // Insert new stock row (allows duplicates)
  const addStockItem = async (branchId: string, productId: string, quantity: number) => {
    const { error } = await supabase
      .from('branch_stock')
      .insert({ branch_id: branchId, product_id: productId, status: 'เก็บ', quantity, updated_at: new Date().toISOString() })
    return { error: error?.message ?? null }
  }

  // Always insert new row (duplicates allowed)
  const addProductToBranch = async (branchId: string, productId: string, quantity = 0) => {
    const { error } = await supabase
      .from('branch_stock')
      .insert({ branch_id: branchId, product_id: productId, status: 'เก็บ', quantity, updated_at: new Date().toISOString() })
    return { error: error?.message ?? null }
  }

  return { stock, loading, fetchByBranch, fetchActiveByBranch, setStatus, addStockItem, addProductToBranch }
}
