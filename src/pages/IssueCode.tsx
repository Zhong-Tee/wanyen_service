import { useState, useEffect } from 'react'
import { useCategories } from '../hooks/useCategories'
import { useAvailableCount, useCopyCode } from '../hooks/useCodes'
import { showToast } from '../components/Toast'
import type { CodeCategory } from '../types'

const SUFFIX_KEY = 'wanyen_show_suffix'

export function IssueCode() {
  const { categories, loading: catLoading, error: catError } = useCategories()
  const [selectedCategory, setSelectedCategory] = useState<CodeCategory | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [showSuffix, setShowSuffix] = useState<boolean>(() => {
    try { return localStorage.getItem(SUFFIX_KEY) !== 'false' } catch { return true }
  })
  const { count, loading: countLoading, refetch } = useAvailableCount(selectedCategory?.id ?? null)
  const { copying, copyCode } = useCopyCode()

  useEffect(() => {
    if (selectedCategory) refetch()
  }, [selectedCategory, refetch])

  const handleCategorySelect = (cat: CodeCategory) => {
    setSelectedCategory(cat)
    setQuantity(1)
  }

  const toggleSuffix = () => {
    const next = !showSuffix
    setShowSuffix(next)
    try { localStorage.setItem(SUFFIX_KEY, String(next)) } catch { /* ignore */ }
  }

  const handleCopy = async () => {
    if (!selectedCategory) {
      showToast('กรุณาเลือกประเภทโค้ดก่อน', 'warning')
      return
    }

    const result = await copyCode(
      selectedCategory.id,
      quantity,
      selectedCategory.template ?? null,
      showSuffix
    )

    if (result.success) {
      showToast(`คัดลอกสำเร็จ ${quantity} โค้ด`, 'success')
      refetch()
    } else {
      showToast(result.error ?? 'เกิดข้อผิดพลาด', 'error')
      if (result.actualCount !== undefined) refetch()
    }
  }

  if (catError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-5xl mb-4">⚠️</p>
        <p className="text-red-600 font-medium">เชื่อมต่อฐานข้อมูลไม่ได้</p>
        <p className="text-gray-500 text-sm mt-1">{catError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Category selection */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          ประเภทโค้ด
        </h2>
        {catLoading ? (
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm">ยังไม่มีประเภทโค้ด</p>
            <p className="text-xs mt-1">ไปที่เมนูตั้งค่าเพื่อสร้างประเภทโค้ด</p>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat)}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95
                  ${selectedCategory?.id === cat.id
                    ? 'bg-pink-600 text-white shadow-md shadow-pink-200 scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Remaining count */}
      {selectedCategory && (
        <section className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl border border-pink-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-pink-600 font-medium">
                โค้ดคงเหลือ · {selectedCategory.name}
              </p>
              {countLoading ? (
                <div className="h-8 w-16 bg-pink-100 rounded-lg animate-pulse mt-1" />
              ) : (
                <p className="text-3xl font-bold text-pink-700 mt-0.5">
                  {count ?? 0}
                  <span className="text-base font-normal text-pink-500 ml-1">โค้ด</span>
                </p>
              )}
            </div>
            <div className="text-4xl">🎟️</div>
          </div>
          {count !== null && count === 0 && (
            <p className="text-xs text-red-500 mt-2 font-medium">
              ⚠️ โค้ดหมดแล้ว กรุณา Import เพิ่ม
            </p>
          )}
        </section>
      )}

      {/* Quantity selector */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          จำนวนโค้ดที่ต้องการ
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              onClick={() => setQuantity(n)}
              className={`aspect-square rounded-xl font-bold text-base transition-all active:scale-95
                ${quantity === n
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      {/* Suffix toggle */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">ข้อความต่อท้าย (ขั้นตอนการใช้โค้ด)</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {showSuffix ? 'เปิดอยู่ — คัดลอกพร้อมข้อความอธิบาย' : 'ปิดอยู่ — คัดลอกเฉพาะโค้ด'}
            </p>
          </div>
          <button
            onClick={toggleSuffix}
            className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none
              ${showSuffix ? 'bg-pink-600' : 'bg-gray-300'}`}
            aria-label="toggle suffix"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                ${showSuffix ? 'translate-x-6' : 'translate-x-0'}`}
            />
          </button>
        </div>
      </section>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        disabled={copying || !selectedCategory || count === 0}
        className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2
          ${copying || !selectedCategory || count === 0
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-200 hover:shadow-pink-300'
          }`}
      >
        {copying ? (
          <>
            <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>กำลังคัดลอก...</span>
          </>
        ) : (
          <>
            <span>📋</span>
            <span>คัดลอก {quantity} โค้ด</span>
          </>
        )}
      </button>

      {selectedCategory && count !== null && count > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <p className="font-medium mb-1">📌 วิธีใช้งาน</p>
          <p>
            เลือกประเภทโค้ด → เลือกจำนวน → เปิด/ปิดข้อความต่อท้าย → กดคัดลอก
          </p>
          {quantity > 1 && (
            <p className="mt-1 text-blue-600 text-xs">
              💡 เลือก {quantity} โค้ด จะคัดลอกในข้อความเดียว คั่นด้วย " , "
            </p>
          )}
        </div>
      )}
    </div>
  )
}
