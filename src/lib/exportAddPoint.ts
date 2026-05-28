import ExcelJS from 'exceljs'
import type { LinePointQueue } from '../types'

const HEADERS = ['Phone Number', 'Billing ID', 'Money Amount'] as const

/** สร้างไฟล์ .xlsx ตามเทมเพลต LINE OA Plus (ชีต Dates) */
export async function buildAddPointWorkbook(rows: LinePointQueue[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Dates')

  ws.columns = [
    { width: 16 },
    { width: 14 },
    { width: 14 },
  ]

  const headerRow = ws.addRow([...HEADERS])
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, name: 'Tahoma', size: 11 }
  })

  for (const row of rows) {
    const dataRow = ws.addRow([row.phone, row.billing_id, Number(row.amount_baht)])
    dataRow.getCell(1).numFmt = '@'
    dataRow.getCell(1).value = row.phone
    dataRow.getCell(2).numFmt = '@'
    dataRow.getCell(2).value = row.billing_id
  }

  return wb
}

export async function downloadAddPointExcel(rows: LinePointQueue[], filename: string): Promise<void> {
  const wb = await buildAddPointWorkbook(rows)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
