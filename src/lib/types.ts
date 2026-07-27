/**
 * Domain types for QK Equipment Tracking.
 *
 * These are deliberately free of any Supabase / Postgres detail. The data
 * layer (src/lib/data) is responsible for mapping whatever the backend
 * returns into these shapes, so swapping the backend never ripples into
 * the UI.
 */

/** Stored lifecycle. This is the only status ever written to the database. */
export type Lifecycle = 'OPEN' | 'RETURNED' | 'CANCELLED'

/**
 * Displayed status. Always DERIVED from the return date and lifecycle —
 * never trusted from a stored column, because "due tomorrow" stops being
 * true the moment the clock rolls over.
 */
export type EquipmentStatus =
  | 'ACTIVE'
  | 'DUE_SOON'
  | 'DUE_TODAY'
  | 'OVERDUE'
  | 'RETURNED'
  | 'CANCELLED'

export type UserRole = 'user' | 'admin'

export interface Profile {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  role: UserRole
}

export interface Department {
  id: string
  name: string
  isActive: boolean
  sortOrder: number
}

export interface BorrowingRecord {
  id: string
  recordCode: string

  borrowerId: string
  borrowerName: string
  borrowerEmail: string

  borrowedFrom: string
  departmentId: string | null

  itemName: string
  purpose: string
  expectedReturnDate: string // ISO date, yyyy-MM-dd

  borrowedAt: string
  returnedAt: string | null
  returnedByEmail: string | null

  lifecycle: Lifecycle
  /** Derived server-side, recomputed client-side on render. */
  status: EquipmentStatus
  daysUntilDue: number | null

  borrowingProofPaths: string[]
  returnProofPaths: string[]
  returnNotes: string | null

  reminder1SentAt: string | null
  reminder2SentAt: string | null

  createdAt: string
  updatedAt: string
}

export interface CreateBorrowingInput {
  borrowedFrom: string
  departmentId: string | null
  itemName: string
  purpose: string
  expectedReturnDate: string
  /** Files are uploaded by the data layer; the UI hands over raw File objects. */
  proofFiles: File[]
}

export interface RecordFilters {
  search?: string
  status?: EquipmentStatus | 'ALL'
  department?: string | 'ALL'
  /** Admins only; ignored for normal users, who always see just their own. */
  scope?: 'mine' | 'all'
}

export interface DashboardSummary {
  currentlyBorrowed: number
  dueSoon: number
  overdue: number
  returned: number
}

/** Result of looking up a return token, before any mutation happens. */
export type ReturnTokenOutcome =
  | 'OK'
  | 'INVALID'
  | 'EXPIRED'
  | 'ALREADY_RETURNED'
  | 'CANCELLED'
  | 'NO_PROOF'

export interface ReturnTokenPreview {
  outcome: ReturnTokenOutcome
  recordCode: string | null
  borrowerName: string | null
  borrowedFrom: string | null
  itemName: string | null
  purpose: string | null
  expectedReturnDate: string | null
  status: EquipmentStatus | null
}
