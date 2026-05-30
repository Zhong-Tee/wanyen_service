import type { Branch, StoreGroup } from '../types'

export const BRANCH_CSV_COLUMNS = [
  { key: 'id', labels: ['id'] },
  { key: 'store_group', labels: ['store_group', 'ประเภทร้าน'] },
  { key: 'name', labels: ['name', 'ชื่อสาขา'] },
  { key: 'address', labels: ['address', 'ที่อยู่'] },
  { key: 'phone', labels: ['phone', 'เบอร์โทร'] },
  { key: 'rent', labels: ['rent', 'ค่าเช่า'] },
  { key: 'gp_percent', labels: ['gp_percent', 'gp', 'gp(%)', 'GP(%)'] },
  { key: 'kiosk_sim_phone', labels: ['kiosk_sim_phone', 'เบอร์โทร kiosk sim', 'เบอร์โทร Kiosk SIM'] },
  { key: 'sim_code', labels: ['sim_code', 'SIM Code', 'sim code'] },
  { key: 'sim_expiry_date', labels: ['sim_expiry_date', 'วันหมดอายุ'] },
  { key: 'is_active', labels: ['is_active', 'สถานะ'] },
] as const

export type BranchCsvFieldKey = (typeof BRANCH_CSV_COLUMNS)[number]['key']

export interface BranchCsvRow {
  line: number
  id: string
  values: Partial<Record<BranchCsvFieldKey, string>>
}

export interface BranchCsvImportResult {
  updated: number
  skipped: number
  errors: string[]
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function formatCsvCell(value: string | number | boolean | null | undefined): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'เปิด' : 'ปิด'
  return escapeCsvCell(String(value))
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase()
}

function mapHeaderToKey(header: string): BranchCsvFieldKey | null {
  const normalized = normalizeHeader(header)
  for (const col of BRANCH_CSV_COLUMNS) {
    if (col.labels.some((label) => normalizeHeader(label) === normalized)) return col.key
  }
  return null
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r' && next === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

export function branchesToCsv(branches: Branch[]): string {
  const header = BRANCH_CSV_COLUMNS.map((col) => col.labels[col.labels.length - 1]).join(',')
  const lines = branches.map((branch) => {
    const cells: Record<BranchCsvFieldKey, string> = {
      id: formatCsvCell(branch.id),
      store_group: formatCsvCell(branch.store_group?.name ?? ''),
      name: formatCsvCell(branch.name),
      address: formatCsvCell(branch.address),
      phone: formatCsvCell(branch.phone),
      rent: formatCsvCell(branch.rent),
      gp_percent: formatCsvCell(branch.gp_percent),
      kiosk_sim_phone: formatCsvCell(branch.kiosk_sim_phone),
      sim_code: formatCsvCell(branch.sim_code),
      sim_expiry_date: formatCsvCell(branch.sim_expiry_date),
      is_active: formatCsvCell(branch.is_active),
    }
    return BRANCH_CSV_COLUMNS.map((col) => cells[col.key]).join(',')
  })

  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`
}

export function parseBranchCsv(text: string): { rows: BranchCsvRow[]; errors: string[] } {
  const table = parseCsvRows(text.trim())
  const errors: string[] = []
  if (table.length === 0) return { rows: [], errors: ['ไฟล์ CSV ว่างเปล่า'] }

  const headerRow = table[0]
  const keyByIndex = new Map<number, BranchCsvFieldKey>()
  headerRow.forEach((header, index) => {
    const key = mapHeaderToKey(header)
    if (key) keyByIndex.set(index, key)
  })

  if (![...keyByIndex.values()].includes('id')) {
    errors.push('ไม่พบคอลัมน์ id — ต้องมีคอลัมน์ id สำหรับอัปเดตข้อมูล')
  }

  const rows: BranchCsvRow[] = []
  table.slice(1).forEach((cells, index) => {
    const line = index + 2
    if (cells.every((cell) => cell.trim() === '')) return

    const values: Partial<Record<BranchCsvFieldKey, string>> = {}
    keyByIndex.forEach((key, colIndex) => {
      const raw = cells[colIndex] ?? ''
      if (raw.trim() !== '') values[key] = raw.trim()
    })

    const id = values.id?.trim() ?? ''
    if (!id) {
      errors.push(`แถว ${line}: ไม่มี id`)
      return
    }

    rows.push({ line, id, values })
  })

  return { rows, errors }
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'เปิด', 'open', 'active'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'ปิด', 'close', 'closed', 'inactive'].includes(normalized)) return false
  return null
}

function parseNumber(value: string): number | null {
  const num = Number(value.replace(/,/g, ''))
  return Number.isFinite(num) ? num : null
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, d, m, y] = slashMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return null
}

export function buildBranchCsvUpdate(
  row: BranchCsvRow,
  storeGroups: StoreGroup[],
): { data: Partial<Pick<Branch, 'name' | 'address' | 'phone' | 'store_group_id' | 'rent' | 'gp_percent' | 'kiosk_sim_phone' | 'sim_code' | 'sim_expiry_date' | 'is_active'>>; errors: string[] } {
  const errors: string[] = []
  const data: Partial<Pick<Branch, 'name' | 'address' | 'phone' | 'store_group_id' | 'rent' | 'gp_percent' | 'kiosk_sim_phone' | 'sim_code' | 'sim_expiry_date' | 'is_active'>> = {}
  const { values } = row

  if (values.store_group) {
    const groupName = values.store_group.trim().toUpperCase()
    const storeGroup = storeGroups.find((sg) => sg.name.toUpperCase() === groupName)
    if (!storeGroup) errors.push(`แถว ${row.line}: ไม่พบประเภทร้าน "${values.store_group}"`)
    else data.store_group_id = storeGroup.id
  }

  if (values.name) data.name = values.name.trim()
  if (values.address) data.address = values.address.trim()
  if (values.phone) data.phone = values.phone.trim()
  if (values.kiosk_sim_phone) data.kiosk_sim_phone = values.kiosk_sim_phone.trim()
  if (values.sim_code) data.sim_code = values.sim_code.trim()

  if (values.rent) {
    const rent = parseNumber(values.rent)
    if (rent == null) errors.push(`แถว ${row.line}: ค่าเช่า "${values.rent}" ไม่ถูกต้อง`)
    else data.rent = rent
  }

  if (values.gp_percent) {
    const gp = parseNumber(values.gp_percent)
    if (gp == null) errors.push(`แถว ${row.line}: GP "${values.gp_percent}" ไม่ถูกต้อง`)
    else data.gp_percent = gp
  }

  if (values.sim_expiry_date) {
    const date = normalizeDate(values.sim_expiry_date)
    if (!date) errors.push(`แถว ${row.line}: วันหมดอายุ "${values.sim_expiry_date}" ไม่ถูกต้อง (ใช้ YYYY-MM-DD)`)
    else data.sim_expiry_date = date
  }

  if (values.is_active) {
    const active = parseBoolean(values.is_active)
    if (active == null) errors.push(`แถว ${row.line}: สถานะ "${values.is_active}" ไม่ถูกต้อง (ใช้ เปิด/ปิด)`)
    else data.is_active = active
  }

  return { data, errors }
}

export function downloadBranchCsv(branches: Branch[], filename = 'branches-template.csv') {
  const csv = branchesToCsv(branches)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
