import { useCategories } from '../hooks/useCategories'
import { useReport } from '../hooks/useCodes'

export function Report() {
  const { categories, loading: catLoading } = useCategories()
  const { items, loading: reportLoading, refetch } = useReport(categories)

  const loading = catLoading || reportLoading

  const grandTotal = items.reduce((s, i) => s + i.total, 0)
  const grandAvailable = items.reduce((s, i) => s + i.available, 0)
  const grandUsed = items.reduce((s, i) => s + i.used, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">รายงาน</h1>
          <p className="text-sm text-gray-500 mt-0.5">สรุปจำนวนโค้ดแต่ละประเภท</p>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-violet-600 font-medium bg-violet-50 px-3 py-1.5 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-50"
        >
          <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
          รีเฟรช
        </button>
      </div>

      {/* Summary cards */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="โค้ดทั้งหมด" value={grandTotal} color="violet" icon="🎟️" />
          <SummaryCard label="คงเหลือ" value={grandAvailable} color="green" icon="✅" />
          <SummaryCard label="ใช้แล้ว" value={grandUsed} color="gray" icon="✔️" />
        </div>
      )}

      {/* Per-category breakdown */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
          รายละเอียดแต่ละประเภท
        </h2>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="h-4 w-24 bg-gray-100 rounded" />
                <div className="h-3 bg-gray-100 rounded-full" />
                <div className="flex gap-4">
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-4xl mb-2">📊</p>
            <p className="text-sm">ยังไม่มีข้อมูล</p>
            <p className="text-xs mt-1">สร้างประเภทโค้ดและ Import โค้ดก่อน</p>
          </div>
        ) : (
          <div className="space-y-5">
            {items.map(({ category, total, available, used }) => {
              const usedPct = total > 0 ? Math.round((used / total) * 100) : 0
              const availPct = 100 - usedPct

              return (
                <div key={category.id} className="space-y-2">
                  {/* Category header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 font-bold text-xs flex items-center justify-center">
                        {category.name.slice(0, 2)}
                      </span>
                      <span className="font-semibold text-gray-800">{category.name}</span>
                    </div>
                    <span className="text-xs text-gray-400 font-medium">
                      {total} โค้ดทั้งหมด
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${availPct}%` }}
                    />
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1 text-violet-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
                      คงเหลือ {available.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-gray-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                      ใช้แล้ว {used.toLocaleString()}
                    </span>
                    {total > 0 && (
                      <span className="ml-auto text-gray-400">
                        คงเหลือ {availPct}%
                      </span>
                    )}
                  </div>

                  {available === 0 && total > 0 && (
                    <p className="text-xs text-red-500 font-medium">⚠️ โค้ดหมดแล้ว — กรุณา Import เพิ่ม</p>
                  )}
                  {available > 0 && available <= 10 && (
                    <p className="text-xs text-yellow-600 font-medium">⚠️ โค้ดเหลือน้อย ({available} โค้ด)</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Legend */}
      {!loading && items.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 flex gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gradient-to-r from-violet-500 to-purple-500 inline-block" />
            แถบสี = สัดส่วนโค้ดที่ยังคงเหลือ
          </span>
          <span className="flex items-center gap-1.5">
            <span>⚠️</span>
            แจ้งเตือนเมื่อเหลือ ≤ 10 โค้ด
          </span>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: number
  color: 'violet' | 'green' | 'gray'
  icon: string
}) {
  const styles = {
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  }

  return (
    <div className={`rounded-xl border p-3 text-center ${styles[color]}`}>
      <p className="text-xl">{icon}</p>
      <p className="text-xl font-bold mt-1">{value.toLocaleString()}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
    </div>
  )
}
