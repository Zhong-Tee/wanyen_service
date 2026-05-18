import * as XLSX from 'xlsx'

export interface ExcelCodeEntry {
  code: string
  status: 'available' | 'used'
}

const CODE_RE = /^\d{6}$/

/**
 * Decode HTML entities using the browser's built-in parser.
 * e.g. "&#39;779829" → "'779829", "&amp;" → "&"
 * xlsx sometimes stores .xls string cells with HTML-encoded content.
 */
function decodeHtml(raw: string): string {
  const el = document.createElement('textarea')
  el.innerHTML = raw
  return el.value
}

/**
 * Normalize any cell value to a 6-digit code string.
 * Handles: HTML entities (&#39;), apostrophes, numbers needing zero-padding.
 */
function normalizeToCode(val: unknown): string | null {
  if (val === null || val === undefined) return null

  if (typeof val === 'number') {
    if (!isFinite(val) || val < 0) return null
    const s = Math.round(val).toString().padStart(6, '0')
    return CODE_RE.test(s) ? s : null
  }

  // 1. Decode HTML entities first  ("&#39;779829" → "'779829")
  // 2. Trim whitespace
  // 3. Strip leading apostrophe/quote variants
  let s = decodeHtml(String(val))
    .trim()
    .replace(/^['\u2018\u2019\u02BC\u0060\u00B4]+/, '')
    .trim()

  if (CODE_RE.test(s)) return s

  // Zero-pad short numeric strings  ("30654" → "030654")
  if (/^\d{1,5}$/.test(s)) {
    const padded = s.padStart(6, '0')
    if (CODE_RE.test(padded)) return padded
  }

  return null
}

function parseStatus(val: unknown): 'available' | 'used' {
  if (val === null || val === undefined) return 'available'
  const s = decodeHtml(String(val)).trim()
  return s === '' || s === 'ยังไม่ถูกใช้' || s === 'available' ? 'available' : 'used'
}

export function parseExcelCodes(file: File): Promise<ExcelCodeEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) { reject(new Error('ไม่สามารถอ่านไฟล์ได้')); return }

        const workbook = XLSX.read(data, { type: 'array' })
        const results = new Map<string, 'available' | 'used'>()

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          if (!sheet['!ref']) continue

          const range = XLSX.utils.decode_range(sheet['!ref'])

          // ── Primary: column A = code, column B = status ─────────────────────
          for (let r = range.s.r; r <= range.e.r; r++) {
            const cellA = sheet[XLSX.utils.encode_cell({ r, c: 0 })]
            const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })]
            if (!cellA) continue

            const code = normalizeToCode(cellA.v)
            if (!code) continue

            const status = parseStatus(cellB?.v)
            if (!results.has(code)) results.set(code, status)
          }

          // ── Fallback: scan all cells if primary found nothing ────────────────
          if (results.size === 0) {
            for (const addr of Object.keys(sheet)) {
              if (addr.startsWith('!')) continue
              const code = normalizeToCode(sheet[addr].v)
              if (code && !results.has(code)) results.set(code, 'available')
            }
          }
        }

        resolve(
          Array.from(results.entries()).map(([code, status]) => ({ code, status }))
        )
      } catch (err) {
        reject(
          new Error(
            `เกิดข้อผิดพลาดในการอ่านไฟล์: ${err instanceof Error ? err.message : 'Unknown error'}`
          )
        )
      }
    }

    reader.onerror = () => reject(new Error('เกิดข้อผิดพลาดในการโหลดไฟล์'))
    reader.readAsArrayBuffer(file)
  })
}
