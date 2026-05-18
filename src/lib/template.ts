export const DEFAULT_TEMPLATE = `สามารถทำรายการใหม่ด้วย
โค้ด((ฟรี))ไม่ต้องชำระเพิ่ม
โค้ด : {{CODE}}

(ขั้นตอนการใช้โค้ด)
1. เลือกสินค้า (กรณีมีมากกว่า1 ลาย)
2. กรอกข้อความ +  เลือกรูปแบบตัวอักษรที่ต้องการ 
3. ตรวจสอบข้อความก่อนพิมพ์
4. กดปุ่ม " กรอกโค้ดส่วนลด " ข้างๆ สรุปยอด
5. กรอกเลขโค้ด 6 หลัก กด ✅ ข้างๆเลข 0
** อายุโค้ด 30 วันหลังได้รับ

จากนั้นรอระบบตรวจสอบ เเละผลิตสินค้าสักครู่ค่ะ......`

/**
 * Build the final clipboard message.
 * - codes: array of 6-digit code strings
 * - template: full template with {{CODE}} placeholder
 * - showSuffix: when false, truncate at the line containing the code(s)
 *
 * Multiple codes are joined with ", " and replace {{CODE}} once.
 */
export function buildMessage(
  codes: string[],
  template: string,
  showSuffix: boolean
): string {
  const codeStr = codes.join(', ')
  const filled = template.replace('{{CODE}}', codeStr)

  if (showSuffix) return filled

  // Keep only up to (and including) the line that contains the code string
  const lines = filled.split('\n')
  const codeLineIdx = lines.findIndex((l) => l.includes(codeStr))
  const cutAt = codeLineIdx === -1 ? lines.length - 1 : codeLineIdx
  return lines.slice(0, cutAt + 1).join('\n').trimEnd()
}
