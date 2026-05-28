/** ลบช่องว่าง ขีด และอักขระที่ไม่ใช่ตัวเลข (รองรับ +66) */
function extractPhoneDigits(raw: string): string {
  let s = raw.replace(/[\s\u00A0\-–—().]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  return s.replace(/\D/g, '')
}

/**
 * ทำความสะอาดช่องกรอก — คืนเฉพาะตัวเลขสูงสุด 10 หลัก
 * +66814052604 → 0814052604, 081-405-2604 → 0814052604
 */
export function sanitizePhoneInput(input: string): string {
  let digits = extractPhoneDigits(input)

  if (digits.startsWith('66')) {
    digits = `0${digits.slice(2)}`
  } else if (digits.length === 9 && digits.startsWith('8')) {
    digits = `0${digits}`
  }

  if (digits.startsWith('0')) {
    return digits.slice(0, 10)
  }

  return digits.slice(0, 10)
}

/** แปลงเบอร์ไทยเป็น 10 หลัก ขึ้นต้น 0 (เก็บ/ส่ง Excel เป็น text) */
export function normalizeThaiPhone(input: string): string | null {
  const digits = sanitizePhoneInput(input)
  if (digits.length === 10 && digits.startsWith('0')) return digits
  return null
}

export function formatPhoneDisplay(phone: string): string {
  const n = normalizeThaiPhone(phone)
  if (!n || n.length !== 10) return phone
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`
}
