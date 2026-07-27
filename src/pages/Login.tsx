import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BellRing, CheckCircle2, ClipboardList } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Alert, Button, Spinner } from '@/components/ui'

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'One place for every item',
    body: 'No more scrolling through WhatsApp to find who took the camera.',
  },
  {
    icon: BellRing,
    title: 'Reminders before the deadline',
    body: 'An email the day before, and again on the return date.',
  },
  {
    icon: CheckCircle2,
    title: 'Proof on both ends',
    body: 'A photo when it goes out, a photo when it comes back.',
  },
]

export default function Login() {
  const { session, loading, signInWithGoogle } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (session) return <Navigate to="/" replace />

  const handleSignIn = async () => {
    setError(null)
    setSigningIn(true)
    try {
      await signInWithGoogle()
      // A redirect follows; the spinner stays up until the browser navigates.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.')
      setSigningIn(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Left: the pitch. Hidden on mobile, where the button is all that matters. */}
      <div className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 0, transparent 45%), radial-gradient(circle at 80% 70%, white 0, transparent 40%)',
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-base font-bold text-brand-700">
            QK
          </span>
          <span className="text-lg font-semibold">Equipment Tracking</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Keep track of every borrowed item.
          </h1>
          <p className="mt-3 text-xl text-brand-100">Never miss a return deadline.</p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-brand-100">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-brand-200">QK Console · QK Tech</p>
      </div>

      {/* Right: sign in. */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
              QK
            </span>
            <div>
              <p className="font-semibold text-slate-900">Equipment Tracking</p>
              <p className="text-sm text-slate-500">QK Console · QK Tech</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-2 text-slate-600">
            Use your work Google account. Borrowing records and reminder emails are tied to it.
          </p>

          {error && (
            <Alert tone="error" className="mt-5">
              {error}
            </Alert>
          )}

          <Button
            size="lg"
            variant="secondary"
            onClick={handleSignIn}
            loading={signingIn}
            className="mt-6 w-full"
          >
            {!signingIn && <GoogleMark />}
            {signingIn ? 'Redirecting to Google…' : 'Continue with Google'}
          </Button>

          <p className="mt-6 text-xs leading-relaxed text-slate-500">
            We only read your name, email address and profile picture. No password is created or
            stored.
          </p>

          <div className="mt-10 space-y-4 lg:hidden">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <f.icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{f.title}</p>
                  <p className="text-sm text-slate-500">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
