import { useState } from 'react'
import { Layout } from './components/Layout'
import type { Page } from './components/Layout'
import { ToastContainer, useToast } from './components/Toast'
import { IssueCode } from './pages/IssueCode'
import { Settings } from './pages/Settings'
import { Report } from './pages/Report'

export default function App() {
  const [activePage, setActivePage] = useState<Page>('issue')
  const { toasts, removeToast } = useToast()

  return (
    <>
      <Layout activePage={activePage} onNavigate={setActivePage}>
        {activePage === 'issue' && <IssueCode />}
        {activePage === 'report' && <Report />}
        {activePage === 'settings' && <Settings />}
      </Layout>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  )
}
