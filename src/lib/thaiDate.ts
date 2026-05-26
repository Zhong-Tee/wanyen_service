/** ปฏิทินและช่วงเวลาสำหรับประเทศไทย (UTC+7) */
export const THAI_TIMEZONE = 'Asia/Bangkok'

/** วันที่ YYYY-MM-DD ตามปฏิทินไทย */
export function thaiDateYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: THAI_TIMEZONE }).format(date)
}

/** วันที่ 1 ของเดือนปัจจุบัน (ไทย) */
export function thaiMonthStartYmd(date: Date = new Date()): string {
  const ymd = thaiDateYmd(date)
  return `${ymd.slice(0, 7)}-01`
}

/** เริ่มต้นวันในไทย → ISO สำหรับ query Supabase */
export function thaiDayStartIso(ymd: string): string {
  return `${ymd}T00:00:00+07:00`
}

/** สิ้นสุดวันในไทย → ISO สำหรับ query Supabase */
export function thaiDayEndIso(ymd: string): string {
  return `${ymd}T23:59:59.999+07:00`
}

/** ช่วงวันที่เริ่มต้นเดือนถึงวันนี้ (ไทย) */
export function defaultHistoryRangeThai(): { from: string; to: string } {
  const to = thaiDateYmd()
  const from = thaiMonthStartYmd()
  return { from, to }
}
