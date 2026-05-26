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

// ── Branch system ────────────────────────────────────────────────────────────

export interface StoreGroup {
  id: string
  name: string
  created_at: string
}

export interface Branch {
  id: string
  store_group_id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
  rent: number | null
  gp_percent: number | null
  created_at: string
  store_group?: StoreGroup
}

// ── Products & Stock ─────────────────────────────────────────────────────────

export interface Product {
  id: string
  name: string
  description: string | null
  image_url: string | null
  created_at: string
}

export type StockStatus = 'กำลังใช้' | 'เก็บ' | 'หมด'

export interface BranchStock {
  id: string
  branch_id: string
  product_id: string
  status: StockStatus
  quantity: number
  updated_at: string
  product?: Product
  branch?: Branch
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'completed'

export interface Job {
  id: string
  title: string
  description: string | null
  status: JobStatus
  created_at: string
  completed_at: string | null
  images?: JobImage[]
}

export interface JobImage {
  id: string
  job_id: string
  image_url: string
  created_at: string
}

// ── Deliveries ───────────────────────────────────────────────────────────────

export type DeliveryStatus = 'ต้องจัดส่ง' | 'จัดส่งแล้ว' | 'ได้รับแล้ว'

export interface Delivery {
  id: string
  to_branch_id: string
  tracking_number: string | null
  status: DeliveryStatus
  notes: string | null
  created_at: string
  shipped_at: string | null
  received_at: string | null
  branch?: Branch
  items?: DeliveryItem[]
}

export interface DeliveryItem {
  id: string
  delivery_id: string
  product_id: string
  quantity: number
  product?: Product
}

// ── Kiosk UI ─────────────────────────────────────────────────────────────────

export interface KioskUiOption {
  id: string
  name: string
  store_group_id: string
  sort_order: number
  is_active: boolean
  created_at: string
  store_group?: StoreGroup
}

export interface UiChangeLog {
  id: string
  branch_id: string
  branch_name: string
  store_group_id: string
  ui_name: string
  created_at: string
}
