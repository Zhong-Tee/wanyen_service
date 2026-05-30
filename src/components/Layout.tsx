import type { ReactNode } from 'react'
import type { BadgeCounts } from '../hooks/useBadgeCounts'

export type Page = 'issue' | 'point' | 'catalog' | 'stock' | 'job' | 'delivery' | 'report' | 'printer' | 'changeui' | 'settings'

interface LayoutProps {
  children: ReactNode
  activePage: Page
  onNavigate: (page: Page) => void
  badges?: BadgeCounts
}

const NAV_ITEMS: { page: Page; label: string; icon: string }[] = [
  { page: 'issue',    label: 'ออกโค้ด', icon: '🎟️' },
  { page: 'point',    label: '+Point',  icon: '➕' },
  { page: 'stock',    label: 'Stock',    icon: '📦' },
  { page: 'job',      label: 'Job',      icon: '📋' },
  { page: 'delivery', label: 'จัดส่ง',   icon: '🚚' },
  { page: 'report',   label: 'รายงาน',   icon: '📊' },
  { page: 'printer',  label: 'Printer',  icon: '🖨️' },
  { page: 'changeui', label: 'เปลี่ยน UI', icon: '🎨' },
  { page: 'catalog',  label: 'สินค้า',   icon: '🛍️' },
  { page: 'settings', label: 'ตั้งค่า',   icon: '⚙️' },
]

function getBadge(page: Page, badges?: BadgeCounts): number {
  if (!badges) return 0
  if (page === 'job') return badges.job
  if (page === 'delivery') return badges.delivery
  if (page === 'report') return badges.service
  if (page === 'printer') return badges.printer
  return 0
}

export function Layout({ children, activePage, onNavigate, badges }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-pink-600 to-purple-700 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xl">🎟️</span>
            <span className="font-semibold text-base leading-tight">
              Wanyen Service<br />
              <span className="text-xs font-normal opacity-90">Code Manager</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden sm:flex gap-0.5 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavButton
                key={item.page}
                label={item.label}
                icon={item.icon}
                active={activePage === item.page}
                badge={getBadge(item.page, badges)}
                onClick={() => onNavigate(item.page)}
              />
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-24 sm:pb-8">
        {children}
      </main>

      {/* Bottom nav (mobile only) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 shadow-lg">
        <div className="flex overflow-x-auto scrollbar-hide">
          {NAV_ITEMS.map((item) => (
            <MobileNavButton
              key={item.page}
              label={item.label}
              icon={item.icon}
              active={activePage === item.page}
              badge={getBadge(item.page, badges)}
              onClick={() => onNavigate(item.page)}
            />
          ))}
        </div>
      </nav>
    </div>
  )
}

function NavButton({ label, icon, active, badge, onClick }: { label: string; icon: string; active: boolean; badge: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
        ${active ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function MobileNavButton({ label, icon, active, badge, onClick }: { label: string; icon: string; active: boolean; badge: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 relative flex flex-col items-center justify-center py-2 px-3 gap-0.5 text-xs font-medium transition-colors min-w-[60px]
        ${active ? 'text-pink-600' : 'text-gray-500 hover:text-gray-700'}`}
    >
      <span className={`text-xl transition-transform ${active ? 'scale-110' : ''}`}>{icon}</span>
      <span className="leading-tight">{label}</span>
      {badge > 0 && (
        <span className="absolute top-1 right-2 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
