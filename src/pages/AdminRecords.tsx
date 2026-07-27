import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { PackageOpen, RefreshCw, Search } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDebounced, useRecords } from '@/hooks/useRecords'
import { RecordCard } from '@/components/RecordCard'
import { Alert, Button, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { OPEN_STATUSES } from '@/lib/status'
import type { EquipmentStatus } from '@/lib/types'

const TABS: { value: EquipmentStatus | 'ALL' | 'OPEN'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'OPEN', label: 'Currently borrowed' },
  { value: 'DUE_TODAY', label: 'Due today' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'RETURNED', label: 'Returned' },
]

/**
 * Admin view. Role plumbing already exists end-to-end (profiles.role +
 * is_admin() in RLS), so this page is a thin extension of the dashboard
 * with scope switched to every borrower.
 */
export default function AdminRecords() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [tab, setTab] = useState<EquipmentStatus | 'ALL' | 'OPEN'>('OPEN')
  const [department, setDepartment] = useState('ALL')

  const search = useDebounced(searchInput, 300)
  const { records, loading, error, reload } = useRecords({ search, department, scope: 'all' })

  const departments = useMemo(
    () => Array.from(new Set(records.map((r) => r.borrowedFrom))).sort(),
    [records],
  )

  const visible = useMemo(() => {
    if (tab === 'ALL') return records
    if (tab === 'OPEN') return records.filter((r) => OPEN_STATUSES.includes(r.status))
    return records.filter((r) => r.status === tab)
  }, [records, tab])

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: records.length, OPEN: 0 }
    for (const r of records) {
      if (OPEN_STATUSES.includes(r.status)) c['OPEN'] = (c['OPEN'] ?? 0) + 1
      c[r.status] = (c[r.status] ?? 0) + 1
    }
    return c
  }, [records])

  if (authLoading) return <Skeleton className="h-64 w-full" />
  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">All records</h1>
        <p className="mt-1 text-sm text-slate-600">Every borrowing across all departments.</p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search item, borrower, email or record ID"
              aria-label="Search all records"
              className="pl-9"
            />
          </div>

          <Select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label="Filter by department"
            className="sm:w-44"
          >
            <option value="ALL">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={
                tab === t.value
                  ? 'focus-ring shrink-0 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700'
                  : 'focus-ring shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100'
              }
            >
              {t.label}
              <span className="ml-1.5 tabular-nums text-slate-400">{counts[t.value] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="p-4">
          {loading && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          )}

          {!loading && error && (
            <Alert tone="error" title="Could not load records">
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
              title="No records here"
              description="Nothing matches this view yet."
            />
          )}

          {!loading && !error && visible.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {visible.map((r) => (
                <li key={r.id}>
                  <RecordCard record={r} showBorrower />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
