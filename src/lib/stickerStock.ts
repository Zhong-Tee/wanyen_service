/** สติ๊กเกอร์ม้วน 50 m — สูง 11 mm + ช่องว่าง 2 mm ต่อแถว */
export const STICKER_HEIGHT_MM = 11
export const STICKER_GAP_MM = 2
export const ROLL_LENGTH_M = 50

export const MM_PER_ROW = STICKER_HEIGHT_MM + STICKER_GAP_MM
export const ROWS_PER_ROLL = Math.floor((ROLL_LENGTH_M * 1000) / MM_PER_ROW)
/** 1 แผ่นสติ๊กเกอร์ = 12 แถวบนม้วน */
export const ROWS_PER_SHEET = 12
export const SHEETS_PER_ROLL = Math.floor(ROWS_PER_ROLL / ROWS_PER_SHEET)
export const DEFAULT_LOW_STOCK_THRESHOLD = 150

export function rowsToSheets(rows: number): number {
  return Math.max(0, Math.floor(rows / ROWS_PER_SHEET))
}

export function formatStickerStock(rows: number | null | undefined): string | null {
  if (rows == null) return null
  const sheets = rowsToSheets(rows)
  return `${rows.toLocaleString()} แถว (${sheets.toLocaleString()} แผ่น)`
}
