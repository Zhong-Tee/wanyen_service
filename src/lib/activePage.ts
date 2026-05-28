import type { Page } from '../components/Layout'

const STORAGE_KEY = 'wanyen_active_page'

const VALID_PAGES: Page[] = [
  'issue', 'point', 'catalog', 'stock', 'job',
  'delivery', 'report', 'printer', 'changeui', 'settings',
]

export function loadActivePage(): Page {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && VALID_PAGES.includes(saved as Page)) return saved as Page
  } catch {
    /* ignore */
  }
  return 'issue'
}

export function saveActivePage(page: Page): void {
  try {
    localStorage.setItem(STORAGE_KEY, page)
  } catch {
    /* ignore */
  }
}
