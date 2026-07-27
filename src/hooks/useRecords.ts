import { useCallback, useEffect, useRef, useState } from 'react'
import { data } from '@/lib/data'
import type { BorrowingRecord, RecordFilters } from '@/lib/types'

interface State {
  records: BorrowingRecord[]
  loading: boolean
  error: string | null
}

/**
 * Loads records for the given filters. Filters are passed as individual
 * primitives rather than an object so callers don't have to memoise.
 */
export function useRecords(filters: RecordFilters) {
  const [state, setState] = useState<State>({ records: [], loading: true, error: null })

  const { search, status, department, scope } = filters
  // Guards against an earlier, slower request overwriting a newer result.
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const records = await data.getBorrowingRecords({ search, status, department, scope })
      if (id === requestId.current) setState({ records, loading: false, error: null })
    } catch (e) {
      if (id === requestId.current) {
        setState({
          records: [],
          loading: false,
          error: e instanceof Error ? e.message : 'Something went wrong loading your records.',
        })
      }
    }
  }, [search, status, department, scope])

  useEffect(() => {
    void load()
  }, [load])

  return { ...state, reload: load }
}

/** Debounces a value — used so typing in the search box doesn't fire a query per keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
