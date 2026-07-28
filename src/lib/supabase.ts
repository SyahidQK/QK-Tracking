import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Reported rather than thrown.
 *
 * Throwing here happens during module import — before React mounts and before
 * any error boundary exists — so the app renders a blank white page with the
 * real reason buried in the console. Vite substitutes these values at BUILD
 * time, so the usual cause is a deploy whose environment variables were added
 * after the build, which is exactly when a clear on-screen message matters.
 *
 * App.tsx checks this and renders an explanation instead.
 */
export const configError: string | null =
  !url || !anonKey
    ? 'This deployment is missing its Supabase configuration.'
    : null

export const supabase = createClient(
  // Placeholders keep createClient from throwing when config is absent; the
  // app never gets far enough to use them, because configError short-circuits.
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)

export const PROOF_BUCKET = 'equipment-proofs'

export const APP_URL = (import.meta.env.VITE_APP_URL ?? window.location.origin).replace(/\/$/, '')
