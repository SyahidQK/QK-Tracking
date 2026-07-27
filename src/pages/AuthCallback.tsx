import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Alert, Button, Spinner } from '@/components/ui'

/**
 * Landing point after Google redirects back. The Supabase client picks the
 * PKCE code out of the URL itself (detectSessionInUrl); this page only waits
 * for that to settle and then routes onward.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    // Google reports failures as query params rather than throwing.
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const oauthError =
      params.get('error_description') ??
      params.get('error') ??
      hashParams.get('error_description') ??
      hashParams.get('error')

    if (oauthError) {
      setError(
        oauthError === 'access_denied'
          ? 'Sign-in was cancelled.'
          : `Google reported: ${oauthError}`,
      )
      return
    }

    const timeout = setTimeout(() => {
      if (active) setError('Sign-in is taking longer than expected. Please try again.')
    }, 15000)

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        clearTimeout(timeout)

        if (error) {
          setError('Could not complete sign-in. Please try again.')
          return
        }
        navigate(data.session ? '/' : '/login', { replace: true })
      })
      .catch(() => {
        if (active) {
          clearTimeout(timeout)
          setError('Could not complete sign-in. Please try again.')
        }
      })

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [navigate])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Alert tone="error" title="Sign-in failed">
            {error}
          </Alert>
          <Link to="/login">
            <Button variant="secondary" className="mt-4 w-full">
              Back to sign in
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <Spinner className="h-6 w-6" />
      <p className="text-sm text-slate-500">Signing you in…</p>
    </div>
  )
}
