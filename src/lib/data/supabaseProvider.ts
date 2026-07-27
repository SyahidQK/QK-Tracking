/**
 * Supabase implementation of DataProvider.
 *
 * This is the ONLY file in the app that knows about tables, columns, buckets
 * or RPC names. Everything above it speaks in domain types.
 */
import { PROOF_BUCKET, supabase } from '../supabase'
import { compressImage, ImageValidationError, MAX_FILES } from '../images'
import { deriveStatus, OPEN_STATUSES } from '../status'
import type {
  BorrowingRecord,
  CreateBorrowingInput,
  DashboardSummary,
  Department,
  EquipmentStatus,
  Lifecycle,
  Profile,
  RecordFilters,
  ReturnTokenPreview,
  UserRole,
} from '../types'
import { DataError, type DataProvider, type UploadProgress } from './types'

// ---------------------------------------------------------------------------
// Row shapes as returned by Postgres
// ---------------------------------------------------------------------------

interface RecordRow {
  id: string
  record_code: string
  borrower_id: string
  borrower_name: string
  borrower_email: string
  borrowed_from: string
  department_id: string | null
  item_name: string
  purpose: string
  expected_return_date: string
  borrowed_at: string
  returned_at: string | null
  returned_by_email: string | null
  lifecycle: Lifecycle
  status: EquipmentStatus
  days_until_due: number | null
  borrowing_proof_paths: string[] | null
  return_proof_paths: string[] | null
  return_notes: string | null
  reminder_1_sent_at: string | null
  reminder_2_sent_at: string | null
  created_at: string
  updated_at: string
}

function toRecord(row: RecordRow): BorrowingRecord {
  return {
    id: row.id,
    recordCode: row.record_code,
    borrowerId: row.borrower_id,
    borrowerName: row.borrower_name,
    borrowerEmail: row.borrower_email,
    borrowedFrom: row.borrowed_from,
    departmentId: row.department_id,
    itemName: row.item_name,
    purpose: row.purpose,
    expectedReturnDate: row.expected_return_date,
    borrowedAt: row.borrowed_at,
    returnedAt: row.returned_at,
    returnedByEmail: row.returned_by_email,
    lifecycle: row.lifecycle,
    // Recomputed on the client so a long-open tab doesn't show a stale badge.
    status: deriveStatus(row.expected_return_date, row.lifecycle),
    daysUntilDue: row.days_until_due,
    borrowingProofPaths: row.borrowing_proof_paths ?? [],
    returnProofPaths: row.return_proof_paths ?? [],
    returnNotes: row.return_notes,
    reminder1SentAt: row.reminder_1_sent_at,
    reminder2SentAt: row.reminder_2_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Error translation — Postgres speak -> human speak
// ---------------------------------------------------------------------------

function translate(error: { message?: string; code?: string } | null, fallback: string): DataError {
  const msg = error?.message ?? ''
  const code = error?.code ?? ''

  if (!navigator.onLine) {
    return new DataError(
      'You appear to be offline. Check your connection and try again — nothing was saved.',
      error,
    )
  }
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return new DataError('You do not have permission to do that.', error)
  }
  if (code === '23505') {
    return new DataError('That record already exists.', error)
  }
  if (code === '23514') {
    return new DataError('Some of the information provided is not valid. Please review the form.', error)
  }
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) {
    return new DataError(
      'Could not reach the server. Check your connection and try again — nothing was saved.',
      error,
    )
  }
  if (/JWT|token is expired|invalid claim/i.test(msg)) {
    return new DataError('Your session has expired. Please sign in again.', error)
  }
  return new DataError(fallback, error)
}

// ---------------------------------------------------------------------------
// Shared upload routine
// ---------------------------------------------------------------------------

async function uploadProofs(
  userId: string,
  recordId: string,
  kind: 'borrow' | 'return',
  files: File[],
  onProgress?: (p: UploadProgress) => void,
): Promise<string[]> {
  if (files.length > MAX_FILES) {
    throw new DataError(`Please attach no more than ${MAX_FILES} photos.`)
  }

  const paths: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!
    onProgress?.({
      percent: Math.round((i / files.length) * 100),
      currentFileName: file.name,
      filesDone: i,
      filesTotal: files.length,
    })

    let prepared: File
    try {
      prepared = await compressImage(file)
    } catch (e) {
      if (e instanceof ImageValidationError) throw new DataError(e.message, e)
      throw new DataError(`Could not process "${file.name}".`, e)
    }

    const path = `${userId}/${recordId}/${kind}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, prepared, {
      contentType: prepared.type,
      upsert: false,
    })

    if (error) {
      // Roll back anything already uploaded, so a half-finished record never
      // leaves orphaned files behind.
      if (paths.length) {
        await supabase.storage.from(PROOF_BUCKET).remove(paths).catch(() => undefined)
      }
      throw translate(
        error,
        `Upload of "${file.name}" failed. Your record was not saved — please try again.`,
      )
    }

    paths.push(path)
  }

  onProgress?.({
    percent: 100,
    currentFileName: '',
    filesDone: files.length,
    filesTotal: files.length,
  })

  return paths
}

async function requireSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new DataError('You need to be signed in to do that.')
  }
  return data.session
}

// ---------------------------------------------------------------------------
// Core reads, as free functions.
//
// The provider methods below delegate to these rather than calling each other
// through `this`, which keeps them safe to destructure and avoids depending on
// how TypeScript infers `this` inside an object literal.
// ---------------------------------------------------------------------------

async function fetchRecordById(id: string): Promise<BorrowingRecord | null> {
  await requireSession()

  const { data, error } = await supabase
    .from('borrowing_records_view')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw translate(error, 'Could not load that record.')
  if (!data) return null
  return toRecord(data as RecordRow)
}

async function fetchRecords(filters: RecordFilters = {}): Promise<BorrowingRecord[]> {
  await requireSession()

  let query = supabase.from('borrowing_records_view').select('*')

  // RLS already restricts normal users to their own rows; this narrows an
  // admin's view when they ask for "just mine".
  if (filters.scope === 'mine') {
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) query = query.eq('borrower_id', userData.user.id)
  }

  if (filters.department && filters.department !== 'ALL') {
    query = query.eq('borrowed_from', filters.department)
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().replace(/[%_]/g, '\\$&')}%`
    query = query.or(
      `item_name.ilike.${term},borrower_name.ilike.${term},` +
        `purpose.ilike.${term},record_code.ilike.${term},borrower_email.ilike.${term}`,
    )
  }

  // Open items first, then soonest due.
  const { data, error } = await query
    .order('lifecycle', { ascending: true })
    .order('expected_return_date', { ascending: true })
    .limit(500)

  if (error) throw translate(error, 'Could not load borrowing records.')

  const rows = (data ?? []) as RecordRow[]
  let records = rows.map(toRecord)

  // Status filtering happens client-side: status is time-derived, so
  // filtering in SQL would go stale against a long-lived page.
  if (filters.status && filters.status !== 'ALL') {
    records = records.filter((r) => r.status === filters.status)
  }

  return records
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const supabaseProvider: DataProvider = {
  async listDepartments() {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order')

    if (error) throw translate(error, 'Could not load the department list.')

    return (data ?? []).map(
      (d): Department => ({
        id: d.id,
        name: d.name,
        isActive: d.is_active,
        sortOrder: d.sort_order,
      }),
    )
  },

  async getCurrentProfile(): Promise<Profile | null> {
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    if (!user) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, role')
      .eq('id', user.id)
      .maybeSingle()

    if (error) throw translate(error, 'Could not load your profile.')

    // The signup trigger normally creates this row. If it hasn't landed yet
    // (first sign-in race), fall back to the auth metadata so the UI still works.
    if (!data) {
      return {
        id: user.id,
        email: user.email ?? '',
        fullName:
          (user.user_metadata?.['full_name'] as string | undefined) ??
          (user.user_metadata?.['name'] as string | undefined) ??
          null,
        avatarUrl: (user.user_metadata?.['avatar_url'] as string | undefined) ?? null,
        role: 'user' as UserRole,
      }
    }

    return {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      avatarUrl: data.avatar_url,
      role: data.role as UserRole,
    }
  },

  async createBorrowingRecord(input: CreateBorrowingInput, onProgress) {
    const session = await requireSession()
    const user = session.user

    const itemName = input.itemName.trim()
    const purpose = input.purpose.trim()

    if (!itemName) throw new DataError('Please enter the item name.')
    if (!purpose) throw new DataError('Please describe what the equipment is for.')
    if (!input.expectedReturnDate) throw new DataError('Please choose an expected return date.')
    if (!input.borrowedFrom) throw new DataError('Please choose which department the item came from.')

    const borrowerName =
      (user.user_metadata?.['full_name'] as string | undefined) ??
      (user.user_metadata?.['name'] as string | undefined) ??
      user.email?.split('@')[0] ??
      'Unknown'

    // Insert first, upload second: the record ID is part of the storage path,
    // and an insert that fails should not leave stray images in the bucket.
    const { data: inserted, error: insertError } = await supabase
      .from('borrowing_records')
      .insert({
        borrower_id: user.id,
        borrower_name: borrowerName,
        borrower_email: user.email,
        borrowed_from: input.borrowedFrom,
        department_id: input.departmentId,
        item_name: itemName,
        purpose,
        expected_return_date: input.expectedReturnDate,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      throw translate(insertError, 'Could not save the borrowing record. Please try again.')
    }

    let paths: string[] = []
    if (input.proofFiles.length) {
      try {
        paths = await uploadProofs(user.id, inserted.id, 'borrow', input.proofFiles, onProgress)
      } catch (e) {
        // Undo the insert so the user isn't left with a photo-less record they
        // didn't know was created.
        await supabase.from('borrowing_records').delete().eq('id', inserted.id)
        throw e
      }

      const { error: updateError } = await supabase
        .from('borrowing_records')
        .update({ borrowing_proof_paths: paths })
        .eq('id', inserted.id)

      if (updateError) {
        throw translate(updateError, 'The photos uploaded but could not be linked to the record.')
      }
    }

    const record = await fetchRecordById(inserted.id)
    if (!record) throw new DataError('The record was saved but could not be read back.')
    return record
  },

  getBorrowingRecords(filters: RecordFilters = {}) {
    return fetchRecords(filters)
  },

  getBorrowingRecordById(id: string) {
    return fetchRecordById(id)
  },

  async updateBorrowingRecord(id, patch) {
    await requireSession()

    const payload: Record<string, unknown> = {}
    if (patch.expectedReturnDate) payload['expected_return_date'] = patch.expectedReturnDate
    if (patch.purpose !== undefined) payload['purpose'] = patch.purpose.trim()
    if (patch.itemName !== undefined) payload['item_name'] = patch.itemName.trim()

    if (!Object.keys(payload).length) {
      const existing = await fetchRecordById(id)
      if (!existing) throw new DataError('That record no longer exists.')
      return existing
    }

    const { error } = await supabase.from('borrowing_records').update(payload).eq('id', id)
    if (error) throw translate(error, 'Could not update the record.')

    const updated = await fetchRecordById(id)
    if (!updated) throw new DataError('That record no longer exists.')
    return updated
  },

  async markAsReturned(id, proofFiles, notes, onProgress) {
    const session = await requireSession()

    if (!proofFiles.length) {
      throw new DataError('Please attach at least one photo showing the returned equipment.')
    }

    const current = await fetchRecordById(id)
    if (!current) throw new DataError('That record no longer exists.')
    if (current.lifecycle === 'RETURNED') {
      throw new DataError('This equipment has already been marked as returned.')
    }

    const paths = await uploadProofs(session.user.id, id, 'return', proofFiles, onProgress)

    // The `.eq('lifecycle','OPEN')` guard makes this a compare-and-set: if
    // someone else returned it via the email link a moment ago, we affect
    // zero rows rather than overwriting their record.
    const { data, error } = await supabase
      .from('borrowing_records')
      .update({
        lifecycle: 'RETURNED',
        returned_at: new Date().toISOString(),
        returned_by_email: session.user.email,
        return_proof_paths: paths,
        return_notes: notes?.trim() || null,
      })
      .eq('id', id)
      .eq('lifecycle', 'OPEN')
      .select('id')

    if (error) {
      await supabase.storage.from(PROOF_BUCKET).remove(paths).catch(() => undefined)
      throw translate(error, 'Could not record the return. Please try again.')
    }

    if (!data || data.length === 0) {
      await supabase.storage.from(PROOF_BUCKET).remove(paths).catch(() => undefined)
      throw new DataError('This equipment has already been marked as returned.')
    }

    const updated = await fetchRecordById(id)
    if (!updated) throw new DataError('The return was saved but the record could not be read back.')
    return updated
  },

  async getDashboardSummary(scope: 'mine' | 'all' = 'mine') {
    const records = await fetchRecords({ scope })

    const summary: DashboardSummary = {
      currentlyBorrowed: 0,
      dueSoon: 0,
      overdue: 0,
      returned: 0,
    }

    for (const r of records) {
      if (r.status === 'RETURNED') summary.returned++
      if (OPEN_STATUSES.includes(r.status)) summary.currentlyBorrowed++
      if (r.status === 'DUE_SOON' || r.status === 'DUE_TODAY') summary.dueSoon++
      if (r.status === 'OVERDUE') summary.overdue++
    }

    return summary
  },

  async getSignedUrls(paths: string[]): Promise<string[]> {
    if (!paths.length) return []

    const { data, error } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUrls(paths, 60 * 60) // 1 hour

    if (error) throw translate(error, 'Could not load the proof photos.')

    // createSignedUrls reports failures per item rather than throwing, so an
    // entry can come back with an error and a null/empty signedUrl. Drop those:
    // a broken <img> is worse than one fewer thumbnail.
    //
    // The type predicate is doing real work here — `.filter(Boolean)` does not
    // narrow in TypeScript, so it would leave this as (string | null)[].
    return (data ?? [])
      .filter((d) => !d.error)
      .map((d) => d.signedUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0)
  },

  // -------------------------------------------------------------------------
  // Public, token-based return. No session — routed through an Edge Function
  // because verifying the token requires the service role.
  // -------------------------------------------------------------------------

  async previewReturnToken(token: string) {
    try {
      const { data, error } = await supabase.functions.invoke('return-confirm', {
        body: { action: 'preview', token },
      })
      if (error) throw error
      return data as ReturnTokenPreview
    } catch (e) {
      throw new DataError(
        'Could not check this return link. Please try again, or open the app and mark the item returned from your dashboard.',
        e,
      )
    }
  },

  async submitTokenReturn(token, proofFiles, notes, onProgress) {
    if (!proofFiles.length) {
      throw new DataError('Please attach at least one photo showing the returned equipment.')
    }
    if (proofFiles.length > MAX_FILES) {
      throw new DataError(`Please attach no more than ${MAX_FILES} photos.`)
    }

    // No session here, so the browser cannot write to storage directly.
    // Images are compressed client-side, then sent to the Edge Function,
    // which uploads them with the service role.
    const encoded: { name: string; dataUrl: string }[] = []

    for (let i = 0; i < proofFiles.length; i++) {
      const file = proofFiles[i]!
      onProgress?.({
        percent: Math.round((i / proofFiles.length) * 90),
        currentFileName: file.name,
        filesDone: i,
        filesTotal: proofFiles.length,
      })

      let prepared: File
      try {
        prepared = await compressImage(file)
      } catch (e) {
        if (e instanceof ImageValidationError) throw new DataError(e.message, e)
        throw new DataError(`Could not process "${file.name}".`, e)
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(prepared)
      })

      encoded.push({ name: prepared.name, dataUrl })
    }

    onProgress?.({
      percent: 95,
      currentFileName: '',
      filesDone: proofFiles.length,
      filesTotal: proofFiles.length,
    })

    const { data, error } = await supabase.functions.invoke('return-confirm', {
      body: { action: 'submit', token, notes: notes?.trim() || null, files: encoded },
    })

    if (error) {
      throw new DataError(
        'Could not record the return. Please check your connection and try again.',
        error,
      )
    }

    onProgress?.({
      percent: 100,
      currentFileName: '',
      filesDone: proofFiles.length,
      filesTotal: proofFiles.length,
    })

    return data as { outcome: string; recordCode: string | null; itemName: string | null }
  },
}
