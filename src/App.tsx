import { Component, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Layout } from '@/components/Layout'
import { Alert, Button, Spinner } from '@/components/ui'

import Login from '@/pages/Login'
import AuthCallback from '@/pages/AuthCallback'
import Dashboard from '@/pages/Dashboard'
import NewBorrowing from '@/pages/NewBorrowing'
import RecordDetail from '@/pages/RecordDetail'
import AdminRecords from '@/pages/AdminRecords'
import ReturnConfirmation from '@/pages/ReturnConfirmation'

/** Catches render-time crashes so a bad record never shows a blank white page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh items-center justify-center p-6">
          <div className="w-full max-w-md">
            <Alert tone="error" title="Something went wrong">
              The page could not be displayed. Reloading usually fixes it.
            </Alert>
            <Button onClick={() => window.location.reload()} className="mt-4 w-full">
              Reload
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  // Remember where they were headed so a reminder-email deep link survives login.
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />

  return <Layout>{children}</Layout>
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">That page does not exist.</p>
      <Button onClick={() => window.location.assign('/')} className="mt-6">
        Back to dashboard
      </Button>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/return/:token" element={<ReturnConfirmation />} />

            {/* Authenticated */}
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/new"
              element={
                <RequireAuth>
                  <NewBorrowing />
                </RequireAuth>
              }
            />
            <Route
              path="/record/:id"
              element={
                <RequireAuth>
                  <RecordDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminRecords />
                </RequireAuth>
              }
            />

            <Route
              path="*"
              element={
                <RequireAuth>
                  <NotFound />
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
