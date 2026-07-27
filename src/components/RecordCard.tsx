import { Link } from 'react-router-dom'
import { Building2, CalendarDays, Image as ImageIcon, User } from 'lucide-react'
import { StatusBadge } from '@/components/StatusBadge'
import { describeDueDate } from '@/lib/status'
import { cn, formatDate } from '@/lib/utils'
import type { BorrowingRecord } from '@/lib/types'

const ACCENT: Record<string, string> = {
  OVERDUE: 'bg-red-500',
  DUE_TODAY: 'bg-orange-500',
  DUE_SOON: 'bg-amber-500',
  RETURNED: 'bg-emerald-500',
  CANCELLED: 'bg-slate-300',
  ACTIVE: 'bg-blue-500',
}

export function RecordCard({
  record,
  showBorrower = false,
}: {
  record: BorrowingRecord
  showBorrower?: boolean
}) {
  const urgent = record.status === 'OVERDUE' || record.status === 'DUE_TODAY'

  return (
    <Link
      to={`/record/${record.id}`}
      className="focus-ring group relative block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      {/* Colour rail: status readable at a glance while scrolling on a phone. */}
      <span
        className={cn('absolute inset-y-0 left-0 w-1', ACCENT[record.status] ?? 'bg-slate-300')}
        aria-hidden
      />

      <div className="p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">{record.itemName}</h3>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-slate-400">
              {record.recordCode}
            </p>
          </div>
          <StatusBadge status={record.status} className="shrink-0" />
        </div>

        <p className="mt-2.5 line-clamp-2 text-sm text-slate-600">{record.purpose}</p>

        <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Borrowed from</dt>
            <dd>{record.borrowedFrom}</dd>
          </div>

          {showBorrower && (
            <div className="flex min-w-0 items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <dt className="sr-only">Borrower</dt>
              <dd className="truncate">{record.borrowerName}</dd>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Expected return date</dt>
            <dd>{formatDate(record.expectedReturnDate)}</dd>
          </div>

          {record.borrowingProofPaths.length > 0 && (
            <div className="flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <dt className="sr-only">Photos attached</dt>
              <dd>{record.borrowingProofPaths.length}</dd>
            </div>
          )}
        </dl>

        <p
          className={cn(
            'mt-3 text-xs font-medium',
            urgent ? 'text-red-600' : 'text-slate-500',
          )}
        >
          {describeDueDate(record.expectedReturnDate, record.lifecycle)}
        </p>
      </div>
    </Link>
  )
}
