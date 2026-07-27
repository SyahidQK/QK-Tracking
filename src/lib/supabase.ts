import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loudly at boot rather than producing confusing 401s later.
  throw new Error(
    'Missing Supabase configuration. Copy .env.example to .env and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

export const PROOF_BUCKET = 'equipment-proofs'

export const APP_URL = (import.meta.env.VITE_APP_URL ?? window.location.origin).replace(/\/$/, '')
