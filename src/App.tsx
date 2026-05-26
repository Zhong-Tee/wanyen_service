import { useState } from 'react'
import { Layout } from './components/Layout'
import type { Page } from './components/Layout'
import { ToastContainer, useToast } from './components/Toast'
import { useBadgeCounts } from './hooks/useBadgeCounts'
import { IssueCode } from './pages/IssueCode'
import { Settings } from './pages/Settings'
import { Report } from './pages/Report'
import { Stock } from './pages/Stock'
import { JobPage } from './pages/Job'
import { Catalog } from './pages/Catalog'
import { DeliveryPage } from './pages/Delivery'
import { Printer } from './pages/Printer'
import { ChangeUI } from './pages/ChangeUI'

export default function App() {
  const [activePage, setActivePage] = useState<Page>('issue')
  const { toasts, removeToast } = useToast()
  const { counts, refresh: refreshBadges } = useBadgeCounts()

  const handleNavigate = (page: Page) => {
    setActivePage(page)
    // Refresh badge counts on navigation
    refreshBadges()
  }

  return (
    <>
      <Layout activePage={activePage} onNavigate={handleNavigate} badges={counts}>
        {activePage === 'issue'    && <IssueCode />}
        {activePage === 'printer'  && <Printer />}
        {activePage === 'catalog'  && <Catalog />}
        {activePage === 'stock'    && <Stock />}
        {activePage === 'job'      && <JobPage onAction={refreshBadges} />}
        {activePage === 'delivery' && <DeliveryPage onAction={refreshBadges} />}
        {activePage === 'report'   && <Report serviceAlertCount={counts.service} />}
        {activePage === 'changeui' && <ChangeUI />}
        {activePage === 'settings' && <Settings />}
      </Layout>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  )
}
