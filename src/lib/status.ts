/**
 * Status derivation and formatting.
 *
 * The database computes status too (see derive_status()), but the client
 * recomputes on render. Reason: a dashboard left open overnight would
 * otherwise keep showing yesterday's "Due Today" badge.
 *
 * All date maths is anchored to Asia/Kuala_Lumpur, matching the database.
 * Using the browser's local timezone would make a record flip to OVERDUE
 * at different moments for a user travelling abroad.
 */
import type { EquipmentStatus, Lifecycle } from './types'

export const APP_TIMEZONE = 'Asia/Kuala_Lumpur'

/** Today's date in app time, as yyyy-MM-dd. */
export function appToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Whole days between two yyyy-MM-dd strings (b - a). Timezone-free by design. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1)
  }
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

export function deriveStatus(
  expectedReturnDate: string,
  lifecycle: Lifecycle,
  now: Date = new Date(),
): EquipmentStatus {
  if (lifecycle === 'RETURNED') return 'RETURNED'
  if (lifecycle === 'CANCELLED') return 'CANCELLED'

  const diff = daysBetween(appToday(now), expectedReturnDate)
  if (diff < 0) return 'OVERDUE'
  if (diff === 0) return 'DUE_TODAY'
  if (diff === 1) return 'DUE_SOON'
  return 'ACTIVE'
}

interface StatusStyle {
  label: string
  /** Tailwind classes for the badge. */
  className: string
  /** Tailwind class for a small dot / accent bar. */
  dot: string
}

export const STATUS_STYLES: Record<EquipmentStatus, StatusStyle> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    dot: 'bg-blue-500',
  },
  DUE_SOON: {
    label: 'Due Soon',
    className: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  DUE_TODAY: {
    label: 'Due Today',
    className: 'bg-orange-50 text-orange-800 ring-orange-600/25',
    dot: 'bg-orange-500',
  },
  OVERDUE: {
    label: 'Overdue',
    className: 'bg-red-50 text-red-700 ring-red-600/25',
    dot: 'bg-red-500',
  },
  RETURNED: {
    label: 'Returned',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    dot: 'bg-slate-400',
  },
}

/** "in 3 days" / "today" / "5 days overdue" — for the card subtitle. */
export function describeDueDate(expectedReturnDate: string, lifecycle: Lifecycle): string {
  if (lifecycle === 'RETURNED') return 'Returned'
  if (lifecycle === 'CANCELLED') return 'Cancelled'

  const diff = daysBetween(appToday(), expectedReturnDate)
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  if (diff > 1) return `Due in ${diff} days`
  if (diff === -1) return '1 day overdue'
  return `${Math.abs(diff)} days overdue`
}

/** Statuses that mean the item is still out. */
export const OPEN_STATUSES: EquipmentStatus[] = ['ACTIVE', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE']
