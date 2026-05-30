export interface SimExpiryBranch {
  sim_expiry_date: string | null
}

export function getSimExpiringWithin30Days<T extends SimExpiryBranch>(branchList: T[]): T[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const limit = new Date(today)
  limit.setDate(limit.getDate() + 30)

  return branchList
    .filter((b) => b.sim_expiry_date)
    .filter((b) => {
      const expiry = new Date(b.sim_expiry_date! + 'T00:00:00')
      return expiry <= limit
    })
    .sort((a, b) => new Date(a.sim_expiry_date! + 'T00:00:00').getTime() - new Date(b.sim_expiry_date! + 'T00:00:00').getTime())
}

export function countSimExpiringWithin30Days<T extends SimExpiryBranch>(branchList: T[]): number {
  return getSimExpiringWithin30Days(branchList).length
}

export function formatSimExpiryDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}
