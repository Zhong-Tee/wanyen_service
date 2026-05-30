import { supabase } from './supabase'

export type PrinterStatusKey = 'online' | 'printing' | 'offline' | 'paper_out' | 'ribbon_out' | 'error'

export interface PrinterLatestRecord {
  id: number
  branch_id: string
  branch_name: string
  printer_id: string
  printer_name: string
  printer_ip: string
  status: PrinterStatusKey
  status_label: string | null
  page_count: number | null
  alert_msg: string | null
  event: string | null
  stock_remaining: number | null
  timestamp: string
}

export const STALE_PRINTER_MINUTES = 15

export function minutesSince(timestamp: string): number {
  return (Date.now() - new Date(timestamp).getTime()) / 60000
}

export function getMonitorHealth(minutes: number): 'ok' | 'warning' | 'offline' {
  if (minutes < 6) return 'ok'
  if (minutes < 15) return 'warning'
  return 'offline'
}

export function isPrinterNormal(p: { status: PrinterStatusKey }): boolean {
  return p.status === 'online' || p.status === 'printing'
}

function sortPrinters(printers: PrinterLatestRecord[]): PrinterLatestRecord[] {
  return [...printers].sort((a, b) => a.printer_id.localeCompare(b.printer_id))
}

export function filterActivePrinters(printers: PrinterLatestRecord[]): PrinterLatestRecord[] {
  if (printers.length <= 1) return sortPrinters(printers)
  const sorted = sortPrinters(printers)
  const hasFresh = sorted.some((p) => minutesSince(p.timestamp) < STALE_PRINTER_MINUTES)
  if (!hasFresh) return sorted
  return sorted.filter((p) => minutesSince(p.timestamp) < STALE_PRINTER_MINUTES)
}

export function groupByBranch(records: PrinterLatestRecord[]): PrinterLatestRecord[][] {
  const map = new Map<string, PrinterLatestRecord[]>()
  records.forEach((r) => {
    const key = r.branch_id ?? r.branch_name
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  })
  return Array.from(map.values())
    .map((printers) => filterActivePrinters(printers))
    .filter((printers) => printers.length > 0)
    .sort((a, b) => a[0].branch_name.localeCompare(b[0].branch_name, 'th'))
}

export function countPrinterAlertSummary(records: PrinterLatestRecord[]): {
  problem: number
  monitorOffline: number
  total: number
} {
  const active = groupByBranch(records).flat()
  const problem = active.filter((r) => !isPrinterNormal(r)).length
  const monitorOffline = active.filter(
    (r) => getMonitorHealth(minutesSince(r.timestamp)) === 'offline'
  ).length
  return { problem, monitorOffline, total: problem + monitorOffline }
}

export function countPrinterAlertBadge(records: PrinterLatestRecord[]): number {
  return countPrinterAlertSummary(records).total
}

export async function fetchLatestPrinterRecords(): Promise<PrinterLatestRecord[]> {
  const colsWithLabel =
    'id, branch_id, branch_name, printer_id, printer_name, printer_ip, status, status_label, page_count, alert_msg, event, stock_remaining, timestamp'
  const colsLegacy =
    'id, branch_id, branch_name, printer_id, printer_name, printer_ip, status, page_count, alert_msg, event, stock_remaining, timestamp'

  const withLabel = await supabase
    .from('printer_log')
    .select(colsWithLabel)
    .order('timestamp', { ascending: false })
    .limit(2000)

  let rows: PrinterLatestRecord[] | null
  if (withLabel.error?.message?.includes('status_label')) {
    const legacy = await supabase
      .from('printer_log')
      .select(colsLegacy)
      .order('timestamp', { ascending: false })
      .limit(2000)
    if (legacy.error) throw legacy.error
    rows = (legacy.data ?? []).map((r) => ({ ...r, status_label: null }))
  } else {
    if (withLabel.error) throw withLabel.error
    rows = withLabel.data
  }

  const seen = new Set<string>()
  return (rows ?? []).filter((r) => {
    const key = `${r.branch_id}__${r.printer_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
