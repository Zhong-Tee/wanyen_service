import { thaiDateYmd } from './thaiDate'
import type { Delivery, DeliveryStatus } from '../types'

export function isDeliveryCreatedTodayThai(createdAt: string): boolean {
  return thaiDateYmd(new Date(createdAt)) === thaiDateYmd()
}

export function countDeliveriesByStatus(
  deliveries: Pick<Delivery, 'status' | 'created_at'>[],
) {
  const pendingToday = deliveries.filter(
    (d) => d.status === 'ต้องจัดส่ง' && isDeliveryCreatedTodayThai(d.created_at),
  ).length
  const shipped = deliveries.filter((d) => d.status === 'จัดส่งแล้ว').length
  return { pendingToday, shipped, navTotal: pendingToday + shipped }
}

export function deliveryTabBadge(
  status: DeliveryStatus,
  counts: { pendingToday: number; shipped: number },
): number {
  if (status === 'ต้องจัดส่ง') return counts.pendingToday
  if (status === 'จัดส่งแล้ว') return counts.shipped
  return 0
}
