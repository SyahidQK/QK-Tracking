/**
 * Single swap point for the backend.
 *
 * To migrate off Supabase, implement DataProvider elsewhere and change the
 * line below. Nothing else in the application imports a backend SDK.
 */
import { supabaseProvider } from './supabaseProvider'
import type { DataProvider } from './types'

export const data: DataProvider = supabaseProvider

export { DataError } from './types'
export type { DataProvider, UploadProgress } from './types'
