/** คำนำหน้าเลขบิลรายวัน เช่น 20260528 */
export function billingIdDatePrefix(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** สร้างเลขบิลถัดไปจากลำดับ 3 หลัก เช่น 20260528-001 */
export function formatBillingId(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(3, '0')}`
}

/** ดึงเลขลำดับจาก billing_id ที่มีอยู่ */
export function parseBillingSequence(billingId: string, prefix: string): number | null {
  if (!billingId.startsWith(`${prefix}-`)) return null
  const part = billingId.slice(prefix.length + 1)
  const n = parseInt(part, 10)
  return Number.isFinite(n) ? n : null
}
