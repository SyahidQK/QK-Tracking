import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PackageOpen,
  PackagePlus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDebounced, useRecords } from '@/hooks/useRecords'
import { RecordCard } from '@/components/RecordCard'
import { Alert, Button, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { OPEN_STATUSES } from '@/lib/status'
import { cn } from '@/lib/utils'
import type { EquipmentStatus } from '@/lib/types'

const STATUS_OPTIONS: { value: EquipmentStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DUE_SOON', label: 'Due soon' },
  { value: 'DUE_TODAY', label: 'Due today' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'RETURNED', label: 'Returned' },
]

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  icon: typeof Clock
  tone: 'blue' | 'amber' | 'red' | 'emerald'
  active: boolean
  onClick: () => void
}) {
  const tones = {
    blue: { ring: 'ring-blue-500', icon: 'bg-blue-50 text-blue-600' },
    amber: { ring: 'ring-amber-500', icon: 'bg-amber-50 text-amber-600' },
    red: { ring: 'ring-red-500', icon: 'bg-red-50 text-red-600' },
    emerald: { ring: 'ring-emerald-500', icon: 'bg-emerald-50 text-emerald-600' },
  }[tone]

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition',
        'hover:border-slate-300 hover:shadow-md',
        active && `ring-2 ring-offset-1 ${tones.ring}`,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones.icon)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
    </button>
  )
}

export default function Dashboard() {
  const { profile, session } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState<EquipmentStatus | 'ALL'>('ALL')
  const [department, setDepartment] = useState<string>('ALL')

  const search = useDebounced(searchInput, 300)
  const { records, loading, error, reload } = useRecords({ search, department, scope: 'mine' })

  // Summary counts come from the unfiltered set, so the cards keep showing
  // the true picture while a filter is applied.
  const summary = useMemo(() => {
    let currentlyBorrowed = 0
    let dueSoon = 0
    let overdue = 0
    let returned = 0
    for (const r of records) {
      if (OPEN_STATUSES.includes(r.status)) currentlyBorrowed++
      if (r.status === 'DUE_SOON' || r.status === 'DUE_TODAY') dueSoon++
      if (r.status === 'OVERDUE') overdue++
      if (r.status === 'RETURNED') returned++
    }
    return { currentlyBorrowed, dueSoon, overdue, returned }
  }, [records])

  const departments = useMemo(
    () => Array.from(new Set(records.map((r) => r.borrowedFrom))).sort(),
    [records],
  )

  const visible = useMemo(() => {
    if (status === 'ALL') return records
    if (status === 'ACTIVE') return records.filter((r) => OPEN_STATUSES.includes(r.status))
    return records.filter((r) => r.status === status)
  }, [records, status])

  const firstName = (profile?.fullName ?? session?.user.email ?? '').split(' ')[0] ?? ''
  const filtersApplied = status !== 'ALL' || department !== 'ALL' || searchInput !== ''

  const clearFilters = () => {
    setStatus('ALL')
    setDepartment('ALL')
    setSearchInput('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {firstName ? `Hi, ${firstName}` : 'Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {summary.currentlyBorrowed === 0
              ? 'You have nothing checked out right now.'
              : `You currently have ${summary.currentlyBorrowed} item${
                  summary.currentlyBorrowed === 1 ? '' : 's'
                } out.`}
          </p>
        </div>

        <Link to="/new" className="hidden sm:block">
          <Button>
            <PackagePlus className="h-4 w-4" aria-hidden />
            Borrow item
          </Button>
        </Link>
      </div>

      {summary.overdue > 0 && (
        <Alert tone="error" title={`${summary.overdue} item${summary.overdue === 1 ? '' : 's'} overdue`}>
          Please return {summary.overdue === 1 ? 'it' : 'them'} or update the expected return date.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Currently borrowed"
          value={summary.currentlyBorrowed}
          icon={PackageOpen}
          tone="blue"
          active={status === 'ACTIVE'}
          onClick={() => setStatus(status === 'ACTIVE' ? 'ALL' : 'ACTIVE')}
        />
        <SummaryCard
          label="Due soon"
          value={summary.dueSoon}
          icon={Clock}
          tone="amber"
          active={status === 'DUE_SOON'}
          onClick={() => setStatus(status === 'DUE_SOON' ? 'ALL' : 'DUE_SOON')}
        />
        <SummaryCard
          label="Overdue"
          value={summary.overdue}
          icon={AlertTriangle}
          tone="red"
          active={status === 'OVERDUE'}
          onClick={() => setStatus(status === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
        />
        <SummaryCard
          label="Returned"
          value={summary.returned}
          icon={CheckCircle2}
          tone="emerald"
          active={status === 'RETURNED'}
          onClick={() => setStatus(status === 'RETURNED' ? 'ALL' : 'RETURNED')}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search item, purpose or record ID"
              aria-label="Search records"
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as EquipmentStatus | 'ALL')}
              aria-label="Filter by status"
              className="flex-1 sm:w-40"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            <Select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              aria-label="Filter by department"
              className="flex-1 sm:w-40"
            >
              <option value="ALL">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="p-4">
          {filtersApplied && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                {visible.length} {visible.length === 1 ? 'record' : 'records'}
              </p>
              <button
                onClick={clearFilters}
                className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear filters
              </button>
            </div>
          )}

          {loading && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          )}

          {!loading && error && (
            <Alert tone="error" title="Could not load your records">
              <p>{error}</p>
              <Button variant="secondary" size="sm" onClick={reload} className="mt-3">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Try again
              </Button>
            </Alert>
          )}

          {!loading && !error && visible.length === 0 && (
            <EmptyState
              icon={<PackageOpen className="h-6 w-6" />}
              title={filtersApplied ? 'No records match those filters' : 'Nothing borrowed yet'}
              description={
                filtersApplied
                  ? 'Try clearing the filters or searching for something else.'
                  : 'When you take equipment out, record it here so it does not get lost track of.'
              }
              action={
                filtersApplied ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Link to="/new">
                    <Button>
                      <PackagePlus className="h-4 w-4" aria-hidden />
                      Record a borrowing
                    </Button>
                  </Link>
                )
              }
            />
          )}

          {!loading && !error && visible.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {visible.map((record) => (
                <li key={record.id}>
                  <RecordCard record={record} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Floating action button — the primary action on a phone. */}
      <Link
        to="/new"
        aria-label="Borrow item"
        className="focus-ring fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 sm:hidden"
      >
        <PackagePlus className="h-6 w-6" aria-hidden />
      </Link>
    </div>
  )
}
