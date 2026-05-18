import ExcelJS from 'exceljs'
import type { BranchStock } from '../types'

// ─── Color palette (Pink theme) ───────────────────────────────────────────────
const C = {
  titleBg:      'FF831843',  // pink-900
  headerBg:     'FF9D174D',  // pink-800
  subtitleBg:   'FFBE185D',  // pink-700
  branchBg:     'FFFCE7F3',  // pink-100
  subtotalBg:   'FFFBCFE8',  // pink-200
  grandTotalBg: 'FF831843',  // pink-900
  summaryBg:    'FFFFF1F5',  // pink-50
  activeBg:     'FFD1FAE5',  // green-100
  storedBg:     'FFDBEAFE',  // blue-100
  rowOdd:       'FFFAFAFA',
  rowEven:      'FFFFFFFF',
  white:        'FFFFFFFF',
  black:        'FF111111',
  darkGray:     'FF374151',
  grayText:     'FF4B5563',
  pinkDark:     'FF831843',
}

const FONT = 'Tahoma'

function border(style: ExcelJS.BorderStyle = 'thin', argb = 'FFD1D5DB'): ExcelJS.Border {
  return { style, color: { argb } }
}

function applyBorder(cell: ExcelJS.Cell, style: ExcelJS.BorderStyle = 'thin', argb = 'FFD1D5DB') {
  const b = border(style, argb)
  cell.border = { top: b, left: b, bottom: b, right: b }
}

function setCell(
  cell: ExcelJS.Cell,
  value: string | number | null,
  opts: {
    bg?: string
    fg?: string
    bold?: boolean
    size?: number
    hAlign?: ExcelJS.Alignment['horizontal']
    vAlign?: ExcelJS.Alignment['vertical']
    borderStyle?: ExcelJS.BorderStyle
    borderColor?: string
    italic?: boolean
    wrap?: boolean
  } = {},
) {
  const {
    bg = C.rowEven,
    fg = C.black,
    bold = false,
    size = 12,
    hAlign = 'left',
    vAlign = 'middle',
    borderStyle = 'thin',
    borderColor = 'FFD1D5DB',
    italic = false,
    wrap = false,
  } = opts

  cell.value = value
  cell.font = { bold, italic, color: { argb: fg }, size, name: FONT }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
  cell.alignment = { horizontal: hAlign, vertical: vAlign, wrapText: wrap }
  applyBorder(cell, borderStyle, borderColor)
}

const COLS = 6
const COL_LABELS = ['#', 'สาขา', 'ชื่อสินค้า', 'สถานะ', 'จำนวน(แผ่น)', 'วันที่รับเข้า']
const COL_WIDTHS = [6, 24, 32, 14, 18, 20]

function formatThaiDate(iso: string): string {
  const d = new Date(iso)
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
}

function mergeRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  value: string,
  height: number,
  opts: Parameters<typeof setCell>[2] = {},
) {
  ws.getRow(rowNum).height = height
  ws.mergeCells(rowNum, 1, rowNum, COLS)
  setCell(ws.getCell(rowNum, 1), value, { hAlign: 'center', ...opts })
}

function buildSheet(
  wb: ExcelJS.Workbook,
  groupName: string,
  items: BranchStock[],
  exportDate: string,
) {
  const ws = wb.addWorksheet(groupName, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ state: 'frozen', ySplit: 9 }],
  })
  ws.columns = COL_WIDTHS.map((w) => ({ width: w }))

  // ── Row 1: Company title ──────────────────────────────────────────────────
  mergeRow(ws, 1, 'WANYEN SERVICE', 44, {
    bg: C.titleBg, fg: C.white, bold: true, size: 22, hAlign: 'center',
    borderStyle: 'medium', borderColor: C.titleBg,
  })

  // ── Row 2: Report title ───────────────────────────────────────────────────
  mergeRow(ws, 2, 'รายงานสินค้าคงเหลือ', 30, {
    bg: C.headerBg, fg: C.white, bold: true, size: 16, hAlign: 'center',
    borderStyle: 'medium', borderColor: C.headerBg,
  })

  // ── Row 3: Meta (group | date) ────────────────────────────────────────────
  ws.getRow(3).height = 24
  ws.mergeCells(3, 1, 3, 3)
  setCell(ws.getCell(3, 1), `ประเภทร้าน :  ${groupName}`, {
    bg: C.subtitleBg, fg: C.white, bold: true, size: 13, hAlign: 'left',
    borderStyle: 'thin', borderColor: C.subtitleBg,
  })
  ws.mergeCells(3, 4, 3, COLS)
  setCell(ws.getCell(3, 4), `ดึงข้อมูล ณ วันที่ :  ${exportDate}`, {
    bg: C.subtitleBg, fg: C.white, bold: false, size: 13, hAlign: 'right',
    borderStyle: 'thin', borderColor: C.subtitleBg,
  })

  // ── Row 4: Thin separator ─────────────────────────────────────────────────
  ws.getRow(4).height = 5
  for (let c = 1; c <= COLS; c++) {
    ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBCFE8' } }
  }

  // ── Rows 5–6: Summary boxes ───────────────────────────────────────────────
  const branchSet = new Set(items.map((i) => i.branch_id))
  const totalBranches = branchSet.size
  const activeItems = items.filter((i) => i.status === 'กำลังใช้').length
  const storedItems = items.filter((i) => i.status === 'เก็บ').length
  const totalQty = items.reduce((s, i) => s + (i.quantity ?? 0), 0)

  const summary = [
    { label: 'จำนวนสาขา',     value: `${totalBranches} สาขา`,           bg: 'FFFFF1F5' },
    { label: 'รายการทั้งหมด',  value: `${items.length} รายการ`,          bg: 'FFFCE7F3' },
    { label: 'กำลังใช้งาน',   value: `${activeItems} รายการ`,            bg: 'FFF0FDF4' },
    { label: 'เก็บสำรอง',     value: `${storedItems} รายการ`,            bg: 'FFEFF6FF' },
    { label: 'รวมจำนวน(แผ่น)', value: `${totalQty.toLocaleString()} แผ่น`, bg: 'FFFCE7F3' },
  ]
  ws.getRow(5).height = 20
  ws.getRow(6).height = 30

  summary.forEach((s, idx) => {
    const col = idx + 1
    setCell(ws.getCell(5, col), s.label, { bg: s.bg, fg: C.grayText, bold: false, size: 10, hAlign: 'center', borderStyle: 'thin', borderColor: 'FFE5E7EB' })
    setCell(ws.getCell(6, col), s.value, { bg: s.bg, fg: C.pinkDark, bold: true, size: 14, hAlign: 'center', borderStyle: 'medium', borderColor: 'FFECB8D0' })
  })
  // fill col 6
  for (let r = 5; r <= 6; r++) {
    const cell = ws.getCell(r, 6)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F5' } }
    applyBorder(cell, 'thin', 'FFE5E7EB')
  }

  // ── Row 7: Separator ──────────────────────────────────────────────────────
  ws.getRow(7).height = 5
  for (let c = 1; c <= COLS; c++) {
    ws.getCell(7, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBCFE8' } }
  }

  // ── Row 8: Column headers ─────────────────────────────────────────────────
  ws.getRow(8).height = 30
  const hAligns: ExcelJS.Alignment['horizontal'][] = ['center','left','left','center','center','center']
  COL_LABELS.forEach((label, i) => {
    setCell(ws.getCell(8, i + 1), label, {
      bg: C.headerBg, fg: C.white, bold: true, size: 13,
      hAlign: hAligns[i], borderStyle: 'medium', borderColor: 'FF831843',
    })
  })

  // ── Data rows grouped by branch ───────────────────────────────────────────
  const byBranch = new Map<string, BranchStock[]>()
  items.forEach((s) => {
    if (!byBranch.has(s.branch_id)) byBranch.set(s.branch_id, [])
    byBranch.get(s.branch_id)!.push(s)
  })

  let rowNum = 9
  let seq = 1

  byBranch.forEach((branchItems) => {
    const branchName = branchItems[0].branch?.name ?? '—'
    const sorted = [...branchItems].sort((a, b) =>
      (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'th')
    )
    const branchQty = sorted.reduce((s, i) => s + (i.quantity ?? 0), 0)

    // Branch header
    ws.getRow(rowNum).height = 22
    ws.mergeCells(rowNum, 1, rowNum, COLS)
    setCell(ws.getCell(rowNum, 1), `📍  ${branchName}`, {
      bg: C.branchBg, fg: C.pinkDark, bold: true, size: 13,
      hAlign: 'left', borderStyle: 'thin', borderColor: 'FFECB8D0',
    })
    rowNum++

    // Item rows
    sorted.forEach((s, idx) => {
      const rowBg = idx % 2 === 0 ? C.rowOdd : C.rowEven
      const row = ws.getRow(rowNum)
      row.height = 20

      const statusBg = s.status === 'กำลังใช้' ? 'FFD1FAE5' : 'FFDBEAFE'
      const statusFg = s.status === 'กำลังใช้' ? 'FF065F46' : 'FF1E40AF'

      setCell(row.getCell(1), seq++,        { bg: rowBg, fg: 'FF9CA3AF', size: 11, hAlign: 'center' })
      setCell(row.getCell(2), branchName,   { bg: rowBg, fg: C.darkGray, size: 12, hAlign: 'left' })
      setCell(row.getCell(3), s.product?.name ?? '—', { bg: rowBg, fg: C.black, size: 12, bold: false })
      setCell(row.getCell(4), s.status,     { bg: statusBg, fg: statusFg, size: 12, bold: true, hAlign: 'center' })
      setCell(row.getCell(5), s.quantity ?? 0, { bg: rowBg, fg: C.black, size: 12, hAlign: 'right' })
      setCell(row.getCell(6), s.updated_at ? formatThaiDate(s.updated_at) : '—',
                               { bg: rowBg, fg: C.grayText, size: 11, hAlign: 'center' })
      rowNum++
    })

    // Subtotal
    ws.getRow(rowNum).height = 20
    ws.mergeCells(rowNum, 1, rowNum, 3)
    setCell(ws.getCell(rowNum, 1), `รวมสาขา ${branchName}  (${sorted.length} รายการ)`, {
      bg: C.subtotalBg, fg: C.pinkDark, bold: true, italic: true, size: 12,
      hAlign: 'right', borderStyle: 'thin', borderColor: 'FFECB8D0',
    })
    setCell(ws.getCell(rowNum, 4), 'รวม', {
      bg: C.subtotalBg, fg: C.pinkDark, bold: true, size: 12,
      hAlign: 'center', borderStyle: 'thin', borderColor: 'FFECB8D0',
    })
    setCell(ws.getCell(rowNum, 5), branchQty, {
      bg: C.subtotalBg, fg: C.pinkDark, bold: true, size: 13,
      hAlign: 'right', borderStyle: 'thin', borderColor: 'FFECB8D0',
    })
    setCell(ws.getCell(rowNum, 6), '', {
      bg: C.subtotalBg, borderStyle: 'thin', borderColor: 'FFECB8D0',
    })
    rowNum++

    // Spacer
    ws.getRow(rowNum).height = 5
    for (let c = 1; c <= COLS; c++) {
      ws.getCell(rowNum, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } }
    }
    rowNum++
  })

  // ── Grand total ───────────────────────────────────────────────────────────
  ws.getRow(rowNum).height = 30
  ws.mergeCells(rowNum, 1, rowNum, 4)
  setCell(ws.getCell(rowNum, 1),
    `ยอดรวมทั้งหมด   ${items.length} รายการ  |  ${totalBranches} สาขา`, {
    bg: C.grandTotalBg, fg: C.white, bold: true, size: 14,
    hAlign: 'right', borderStyle: 'medium', borderColor: C.pinkDark,
  })
  setCell(ws.getCell(rowNum, 5), totalQty, {
    bg: C.grandTotalBg, fg: C.white, bold: true, size: 15,
    hAlign: 'right', borderStyle: 'medium', borderColor: C.pinkDark,
  })
  setCell(ws.getCell(rowNum, 6), 'แผ่น', {
    bg: C.grandTotalBg, fg: C.white, bold: true, size: 13,
    hAlign: 'left', borderStyle: 'medium', borderColor: C.pinkDark,
  })
}

export async function exportStockReportExcel(
  data: BranchStock[],
  groupNames: { id: string; name: string }[],
) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Wanyen Service'
  wb.created = new Date()

  const today = new Date()
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
  const exportDate = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear() + 543}`

  groupNames.forEach(({ id, name }) => {
    const groupItems = data.filter(
      (s) => s.branch?.store_group_id === id || s.branch?.store_group?.id === id
    )
    buildSheet(wb, name, groupItems.length > 0 ? groupItems : [], exportDate)
  })

  if (data.length > 0) buildSheet(wb, 'ทั้งหมด', data, exportDate)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = today
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  a.href = url
  a.download = `รายงานสินค้าคงเหลือ_${dateStr}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
