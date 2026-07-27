/**
 * The data-access contract.
 *
 * Every backend call in the application goes through this interface. No React
 * component imports the Supabase client directly. To move to Postgres,
 * Firebase, or a Google Sheets/Apps Script backend later, write a new object
 * implementing `DataProvider` and change the single export in ./index.ts —
 * nothing in src/pages or src/components needs to be touched.
 */
import type {
  BorrowingRecord,
  CreateBorrowingInput,
  DashboardSummary,
  Department,
  Profile,
  RecordFilters,
  ReturnTokenPreview,
} from '../types'

export interface UploadProgress {
  /** 0–100 across the whole batch. */
  percent: number
  currentFileName: string
  filesDone: number
  filesTotal: number
}

export interface DataProvider {
  // ---- reference data ----
  listDepartments(): Promise<Department[]>

  // ---- profile ----
  getCurrentProfile(): Promise<Profile | null>

  // ---- records ----
  createBorrowingRecord(
    input: CreateBorrowingInput,
    onProgress?: (p: UploadProgress) => void,
  ): Promise<BorrowingRecord>

  getBorrowingRecords(filters?: RecordFilters): Promise<BorrowingRecord[]>

  getBorrowingRecordById(id: string): Promise<BorrowingRecord | null>

  updateBorrowingRecord(
    id: string,
    patch: Partial<Pick<BorrowingRecord, 'expectedReturnDate' | 'purpose' | 'itemName'>>,
  ): Promise<BorrowingRecord>

  /** Signed-in return path (from the dashboard, not the emailed link). */
  markAsReturned(
    id: string,
    proofFiles: File[],
    notes?: string,
    onProgress?: (p: UploadProgress) => void,
  ): Promise<BorrowingRecord>

  getDashboardSummary(scope?: 'mine' | 'all'): Promise<DashboardSummary>

  // ---- proof images ----
  /** Private bucket, so viewing requires a short-lived signed URL. */
  getSignedUrls(paths: string[]): Promise<string[]>

  // ---- token-based return (public, no session) ----
  previewReturnToken(token: string): Promise<ReturnTokenPreview>
  submitTokenReturn(
    token: string,
    proofFiles: File[],
    notes?: string,
    onProgress?: (p: UploadProgress) => void,
  ): Promise<{ outcome: string; recordCode: string | null; itemName: string | null }>
}

/**
 * Thrown for anything the user could plausibly act on. `message` is written
 * to be shown directly in the UI — no stack traces, no Postgres jargon.
 */
export class DataError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DataError'
  }
}
