import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnv() {
  const envPath = join(root, '.env')
  const text = readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }
  return env
}

function escapeCsvCell(value) {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function formatCell(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'เปิด' : 'ปิด'
  return escapeCsvCell(String(value))
}

const headers = [
  'id',
  'ประเภทร้าน',
  'ชื่อสาขา',
  'ที่อยู่',
  'เบอร์โทร',
  'ค่าเช่า',
  'GP(%)',
  'เบอร์โทร Kiosk SIM',
  'SIM Code',
  'วันหมดอายุ',
  'สถานะ',
]

const env = loadEnv()
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const { data, error } = await supabase
  .from('branches')
  .select('*, store_group:store_groups(*)')
  .order('name')

if (error) {
  console.error('Failed to fetch branches:', error.message)
  process.exit(1)
}

const lines = (data ?? []).map((branch) => [
  formatCell(branch.id),
  formatCell(branch.store_group?.name ?? ''),
  formatCell(branch.name),
  formatCell(branch.address),
  formatCell(branch.phone),
  formatCell(branch.rent),
  formatCell(branch.gp_percent),
  formatCell(branch.kiosk_sim_phone),
  formatCell(branch.sim_code),
  formatCell(branch.sim_expiry_date),
  formatCell(branch.is_active),
].join(','))

const csv = `\uFEFF${[headers.join(','), ...lines].join('\r\n')}\r\n`
const outPath = join(root, 'file', 'branches-template.csv')
writeFileSync(outPath, csv, 'utf8')
console.log(`Exported ${lines.length} branches to ${outPath}`)
