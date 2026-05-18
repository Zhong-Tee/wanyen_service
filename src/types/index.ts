export interface CodeCategory {
  id: string
  name: string
  template: string | null
  created_at: string
}

export interface Code {
  id: string
  category_id: string
  code: string
  status: 'available' | 'used'
  used_at: string | null
  created_at: string
}

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

export interface ImportResult {
  imported: number
  duplicate: number
  invalid: number
}

export interface ReportItem {
  category: CodeCategory
  total: number
  available: number
  used: number
}
