import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_STOCK_TEMPLATE } from '../lib/template'

const STOCK_TEMPLATE_KEY = 'stock_notification_template'

export function useStockTemplate() {
  const [template, setTemplate] = useState<string>(DEFAULT_STOCK_TEMPLATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchTemplate = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', STOCK_TEMPLATE_KEY)
      .maybeSingle()

    if (!error && data?.value) {
      setTemplate(data.value)
    } else {
      setTemplate(DEFAULT_STOCK_TEMPLATE)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTemplate()
  }, [fetchTemplate])

  const updateTemplate = async (value: string): Promise<{ error: string | null }> => {
    setSaving(true)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: STOCK_TEMPLATE_KEY, value, updated_at: new Date().toISOString() })

    setSaving(false)
    if (error) return { error: error.message }

    setTemplate(value)
    return { error: null }
  }

  return { template, loading, saving, updateTemplate, refetch: fetchTemplate }
}
