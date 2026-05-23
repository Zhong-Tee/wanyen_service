// ── Shared Google Sheets fetcher ──────────────────────────────────────────────

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwhgOB-Amjs7hg4pgpXj1XlVQmNkXBGkJDAqhccYwx1gWERVrcjwlGykkyIq_reV8lf1A/exec'

// (legacy – ใช้เป็น fallback เผื่อ Apps Script ล่ม)
const SHEET_ID = '1Gr_T63Gbxqf-tFhCa7wM0s2PP0V_APGMdxKJiOBIvwc'
const SHEET_GID = '1042994610'
const SHEET_NAME = 'Wanyen_Report'
const PUBLISHED_ID = '2PACX-1vSm3HnirYTWSape0bexkc1ryRSinM-jD-jSxjO8AVg6cJ6njkdrW0dd96sRC8aHPP28L6QmeXPUOCax'

export function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/** แปลง DD/MM/YYYY (CE) → YYYY-MM-DD */
export function toISODate(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('/')
  if (parts.length !== 3) return ddmmyyyy
  const [d, m, y] = parts
  return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** แปลง DD/M/YYYY HH:MM:SS → Date
 *  รองรับ 3 กรณี:
 *   - ปี > 3000 → Apps Script นับ พ.ศ. ซ้ำ 2 รอบ (เช่น 3112) → ลบ 543×2
 *   - ปี > 2500 → พ.ศ. ปกติ (เช่น 2569) → ลบ 543
 *   - ปี ≤ 2500 → ค.ศ. → ใช้ตรงๆ */
export function parseThaiDateTime(raw: string): Date | null {
  const m = raw.trim().match(/^(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)/)
  if (!m) return null
  const [, d, mo, y, h, min, s] = m
  const yearNum = parseInt(y)
  let yearCE: number
  if (yearNum > 3000) {
    yearCE = yearNum - 1086   // พ.ศ. ถูกบวก 543 ซ้ำสองรอบโดย Apps Script
  } else if (yearNum > 2500) {
    yearCE = yearNum - 543    // พ.ศ. ปกติ
  } else {
    yearCE = yearNum          // ค.ศ. ใช้ตรงๆ
  }
  return new Date(yearCE, parseInt(mo) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s))
}

export async function fetchSheetCSV(): Promise<string> {
  const proxy = import.meta.env.DEV ? '/api/sheets' : 'https://docs.google.com'
  // เพิ่ม _t= timestamp เพื่อบังคับดึงข้อมูลใหม่ทุกครั้ง (bypass CDN cache)
  const bust = `_t=${Date.now()}`
  const urls = [
    // gviz/tq ก่อน — real-time กว่า, Google ไม่ cache aggressive
    `${proxy}/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&${bust}`,
    `${proxy}/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}&${bust}`,
    // fallback: published CSV (อาจ cache 1-5 นาที แต่ใช้ได้ถ้า gviz fail)
    `https://docs.google.com/spreadsheets/d/e/${PUBLISHED_ID}/pub?gid=${SHEET_GID}&single=true&output=csv`,
  ]
  const errors: string[] = []
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) { errors.push(`HTTP ${res.status}`); continue }
      const text = await res.text()
      if (text.trimStart().startsWith('<')) { errors.push('HTML response'); continue }
      if (text.trim().length < 5) { errors.push('empty'); continue }
      return text
    } catch (e) { errors.push(String(e)) }
  }
  throw new Error(`ดึง CSV ไม่ได้: ${errors.join(', ')}`)
}

// ── Parsed row ────────────────────────────────────────────────────────────────

export interface SheetRow {
  dateRaw: string       // cols[0]: DD/MM/YYYY (CE)
  timeRaw: string       // cols[1]: HH:MM:SS
  branchName: string    // cols[2]: เช่น "02 CPN EVL FL.2"
  branchNum: string     // ตัวเลขนำหน้า เช่น "02"
  onlineStatus: string  // cols[3]: Online / Offline
  stockStatus: string   // cols[4]: สินค้าพร้อม / ใกล้หมด / หมด / ปิดสินค้า
  productName: string   // cols[5]
  quantity: number      // cols[6]
  lastUpdateRaw: string // cols[7]: DD/M/YYYY_BE HH:MM:SS (Thai calendar)
  dateISO: string       // YYYY-MM-DD (สำหรับ sort)
  dateTime: string      // YYYY-MM-DDTHH:MM:SS (สำหรับ sort)
}

// ── Apps Script JSON fetcher (real-time, ไม่มี Google CDN cache) ──────────────

interface AppsScriptRow {
  date: string        // "dd/MM/yyyy"
  time: string        // "HH:mm:ss"
  branchName: string
  online: string
  stockStatus: string
  product: string
  quantity: number | string
  lastUpdate: string
}

export async function fetchSheetRows(): Promise<SheetRow[]> {
  const res = await fetch(APPS_SCRIPT_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}`)
  const json: AppsScriptRow[] = await res.json()
  return json
    .map((item) => {
      const dateRaw = item.date
      const timeRaw = item.time
      const branchName = String(item.branchName ?? '')
      const branchNum = branchName.match(/^(\d+)/)?.[1] ?? ''
      if (!branchNum || !dateRaw) return null
      const dateISO = toISODate(dateRaw)
      return {
        dateRaw,
        timeRaw,
        branchName,
        branchNum,
        onlineStatus: item.online ?? '',
        stockStatus: item.stockStatus ?? '',
        productName: item.product ?? '',
        quantity: typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity)) || 0,
        lastUpdateRaw: String(item.lastUpdate ?? ''),
        dateISO,
        dateTime: `${dateISO}T${timeRaw}`,
      } as SheetRow
    })
    .filter((r): r is SheetRow => r !== null)
}

/** สถานะ Online/Offline ต่อสาขา จาก snapshot ล่าสุดใน Sheet (col D) */
export async function fetchBranchOnlineMap(): Promise<Map<string, 'online' | 'offline'>> {
  const allRows = await fetchSheetRows()
  if (allRows.length === 0) return new Map()

  const maxDT = allRows.reduce((best, r) => (r.dateTime > best ? r.dateTime : best), '')
  const snapshotRows = allRows.filter((r) => r.dateTime === maxDT)

  const map = new Map<string, 'online' | 'offline'>()
  for (const row of snapshotRows) {
    const status: 'online' | 'offline' =
      row.onlineStatus.toLowerCase() === 'offline' ? 'offline' : 'online'
    const existing = map.get(row.branchNum)
    if (!existing || status === 'offline') {
      map.set(row.branchNum, status)
    }
  }
  return map
}

export function parseAllRows(csv: string): SheetRow[] {
  const rows: SheetRow[] = []
  for (const line of csv.trim().split('\n').filter(Boolean)) {
    const cols = parseCSVLine(line)
    if (cols.length < 7) continue
    const dateRaw = cols[0]
    const timeRaw = cols[1]
    const branchName = cols[2]
    const branchNum = branchName.match(/^(\d+)/)?.[1] ?? ''
    if (!branchNum || !dateRaw) continue
    const dateISO = toISODate(dateRaw)
    rows.push({
      dateRaw, timeRaw, branchName, branchNum,
      onlineStatus: cols[3] ?? '',
      stockStatus: cols[4] ?? '',
      productName: cols[5] ?? '',
      quantity: parseInt(cols[6]) || 0,
      lastUpdateRaw: cols[7] ?? '',
      dateISO,
      dateTime: `${dateISO}T${timeRaw}`,
    })
  }
  return rows
}
