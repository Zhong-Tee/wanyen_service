import { useState, useEffect, useMemo } from 'react'
import { useBranches } from '../hooks/useBranches'
import { useStock } from '../hooks/useStock'
import { useStockReport } from '../hooks/useStockReport'
import { ZoomImage } from '../components/ZoomImage'
import type { StoreGroup } from '../types'

export function Catalog() {
  const { storeGroups, activeBranches: branches, loading: branchLoading } = useBranches()
  const { stock, loading: stockLoading, fetchActiveByBranch } = useStock()
  const { data: allStock } = useStockReport()

  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [branchSearch, setBranchSearch] = useState<string>('')
  const [productSearch, setProductSearch] = useState<string>('')

  const filteredBranches = useMemo(() =>
    branches
      .filter((b) => b.store_group_id === selectedGroup)
      .filter((b) => branchSearch.trim() === '' || b.name.toLowerCase().includes(branchSearch.toLowerCase())),
    [branches, selectedGroup, branchSearch]
  )

  useEffect(() => { setSelectedBranch(''); setBranchSearch('') }, [selectedGroup])
  useEffect(() => { if (selectedBranch) fetchActiveByBranch(selectedBranch) }, [selectedBranch, fetchActiveByBranch])

  const selectedGroupName = storeGroups.find((g) => g.id === selectedGroup)?.name ?? ''
  const selectedBranchName = branches.find((b) => b.id === selectedBranch)?.name ?? ''

  const productSearchResults = useMemo(() => {
    if (productSearch.trim() === '') return []
    return allStock.filter(
      (s) => s.status === 'กำลังใช้' &&
        (s.product?.name ?? '').toLowerCase().includes(productSearch.toLowerCase())
    ).sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'th'))
  }, [allStock, productSearch])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">สินค้า</h1>
        <p className="text-sm text-gray-500 mt-0.5">Catalog สินค้าที่กำลังใช้งาน</p>
      </div>

      {/* Global product search */}
      <div className="relative">
        <input
          type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
          placeholder="🔍 ค้นหาชื่อสินค้า (ทุกสาขา)..."
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white shadow-sm"
        />
        {productSearch && (
          <button onClick={() => setProductSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
        )}
      </div>

      {/* Product search results */}
      {productSearch.trim() !== '' && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ผลการค้นหา</span>
            <span className="text-xs text-gray-400">{productSearchResults.length} รายการ</span>
          </div>
          {productSearchResults.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm text-gray-400">ไม่พบสินค้าที่กำลังใช้งาน</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {productSearchResults.map((s) => {
                const groupName = s.branch?.store_group?.name ?? ''
                const branchName = s.branch?.name ?? '—'
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    {s.product?.image_url ? (
                      <ZoomImage src={s.product.image_url} alt={s.product?.name}
                        className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-pink-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl">📦</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{s.product?.name ?? '—'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {groupName && (
                          <span className="text-xs font-bold bg-pink-600 text-white px-1.5 py-0.5 rounded">{groupName}</span>
                        )}
                        <span className="text-xs text-gray-500">{branchName}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">กำลังใช้</span>
                        <p className="text-xs text-gray-500 mt-0.5 font-semibold">{s.quantity.toLocaleString()} แผ่น</p>
                      </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Filters */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        {branchLoading ? (
          <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
        ) : (
          <>
            {/* Store group buttons */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">ประเภทร้าน</label>
              <div className="flex gap-2 flex-wrap">
                {storeGroups.map((sg: StoreGroup) => (
                  <button key={sg.id}
                    onClick={() => setSelectedGroup(sg.id === selectedGroup ? '' : sg.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95
                      ${selectedGroup === sg.id ? 'bg-pink-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {sg.name}
                  </button>
                ))}
                {storeGroups.length === 0 && <p className="text-sm text-gray-400 italic">ยังไม่มีประเภทร้าน</p>}
              </div>
            </div>

            {/* Branch search + dropdown */}
            {selectedGroup && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 block">สาขา</label>
                <div className="relative">
                  <input
                    type="text" value={branchSearch} onChange={(e) => setBranchSearch(e.target.value)}
                    placeholder="ค้นหาชื่อสาขา..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                  {branchSearch && (
                    <button onClick={() => setBranchSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-xs">✕</button>
                  )}
                </div>
                {filteredBranches.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">ไม่พบสาขา</p>
                ) : (
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
                  >
                    <option value="">— เลือกสาขา —</option>
                    {filteredBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Product grid */}
      {!selectedBranch ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-4xl mb-3">🛍️</p>
          <p className="text-gray-400 text-sm">กรุณาเลือกประเภทร้านและสาขา</p>
          <p className="text-gray-300 text-xs mt-1">เพื่อดู Catalog สินค้าที่กำลังใช้งาน</p>
        </div>
      ) : stockLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="aspect-square bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : stock.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-4xl mb-2">📭</p>
          <p className="text-gray-400 text-sm font-medium">{selectedGroupName} · {selectedBranchName}</p>
          <p className="text-gray-300 text-xs mt-1">ไม่มีสินค้าที่กำลังใช้งาน</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 px-1">
            {selectedGroupName} · {selectedBranchName} — {stock.length} รายการ
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stock.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {item.product?.image_url ? (
                  <ZoomImage src={item.product.image_url} alt={item.product?.name} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
                    <span className="text-4xl">📦</span>
                  </div>
                )}
                <div className="p-3">
                  <p className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">{item.product?.name ?? '—'}</p>
                  {item.product?.description && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.product.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      กำลังใช้
                    </span>
                    <span className="text-xs font-bold text-gray-700">{item.quantity.toLocaleString()} <span className="font-normal text-gray-400">แผ่น</span></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
