import type { ReactNode } from 'react'

export type Page = 'issue' | 'settings' | 'report'

interface LayoutProps {
  children: ReactNode
  activePage: Page
  onNavigate: (page: Page) => void
}

export function Layout({ children, activePage, onNavigate }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-violet-600 to-purple-700 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎟️</span>
            <span className="font-semibold text-base leading-tight">
              Wanyen Service<br />
              <span className="text-xs font-normal opacity-90">Code Manager</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden sm:flex gap-1">
            <NavButton label="ออกโค้ด" icon="📋" active={activePage === 'issue'} onClick={() => onNavigate('issue')} />
            <NavButton label="รายงาน" icon="📊" active={activePage === 'report'} onClick={() => onNavigate('report')} />
            <NavButton label="ตั้งค่า" icon="⚙️" active={activePage === 'settings'} onClick={() => onNavigate('settings')} />
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24 sm:pb-6">
        {children}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 flex shadow-lg">
        <MobileNavButton label="ออกโค้ด" icon="📋" active={activePage === 'issue'} onClick={() => onNavigate('issue')} />
        <MobileNavButton label="รายงาน" icon="📊" active={activePage === 'report'} onClick={() => onNavigate('report')} />
        <MobileNavButton label="ตั้งค่า" icon="⚙️" active={activePage === 'settings'} onClick={() => onNavigate('settings')} />
      </nav>
    </div>
  )
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
        ${active ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function MobileNavButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors
        ${active ? 'text-violet-600' : 'text-gray-500 hover:text-gray-700'}`}
    >
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
