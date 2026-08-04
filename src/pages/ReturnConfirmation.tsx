import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Clock, PackageCheck } from 'lucide-react'
import { data, DataError, type UploadProgress } from '@/lib/data'
import { ImageUpload } from '@/components/ImageUpload'
import { PublicLayout } from '@/components/Layout'
import {
  Alert,
  Button,
  Card,
  CardBody,
  Hint,
  Label,
  ProgressBar,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { ReturnTokenPreview } from '@/lib/types'

/**
 * Public page reached from the "Confirm Equipment Return" button in the
 * reminder email. No sign-in required — the token in the URL is the
 * credential, which is why it is single-use, expiring, and only ever stored
 * as a hash server-side.
 */
export default function ReturnConfirmation() {
  const { token } = useParams<{ token: string }>()

  const [preview, setPreview] = useState<ReturnTokenPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoadError('This return link is incomplete.')
      setLoading(false)
      return
    }

    let active = true
    data
      .previewReturnToken(token)
      .then((p) => active && setPreview(p))
      .catch((e) => active && setLoadError(e instanceof Error ? e.message : 'Could not open this link.'))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [token])

  const handleSubmit = async () => {
    if (!token) return
    setSubmitError(null)

    if (!files.length) {
      setSubmitError('Please attach at least one photo showing the returned equipment.')
      return
    }

    setSubmitting(true)
    setProgress({ percent: 0, currentFileName: '', filesDone: 0, filesTotal: files.length })

    try {
      const result = await data.submitTokenReturn(token, files, notes, setProgress)

      if (result.outcome === 'OK') {
        setDone(true)
      } else if (result.outcome === 'ALREADY_RETURNED') {
        setPreview((p) => (p ? { ...p, outcome: 'ALREADY_RETURNED' } : p))
      } else if (result.outcome === 'EXPIRED') {
        setPreview((p) => (p ? { ...p, outcome: 'EXPIRED' } : p))
      } else {
        setSubmitError('This return link is no longer valid. Please sign in to the app instead.')
      }
    } catch (e) {
      setSubmitError(
        e instanceof DataError || e instanceof Error ? e.message : 'Could not record the return.',
      )
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  // ------------------------------------------------------------- loading
  if (loading) {
    return (
      <PublicLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-52 w-full" />
        </div>
      </PublicLayout>
    )
  }

  // ------------------------------------------------------------- success
  if (done) {
    return (
      <PublicLayout>
        <Card>
          <CardBody className="py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="mt-5 text-xl font-bold text-slate-900">Return recorded successfully.</h1>
            <p className="mt-2 text-slate-600">
              Thank you. The equipment return has been recorded.
            </p>
            {preview?.itemName && (
              <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                {preview.itemName}
              </p>
            )}
            <Link to="/" className="mt-6 inline-block">
              <Button variant="secondary">Open QK Equipment Tracking</Button>
            </Link>
          </CardBody>
        </Card>
      </PublicLayout>
    )
  }

  // ------------------------------------------------------------- problems
  const outcome = preview?.outcome
  const problem =
    loadError
      ? { tone: 'error' as const, icon: AlertCircle, title: 'Something went wrong', body: loadError }
      : outcome === 'INVALID'
        ? {
            tone: 'error' as const,
            icon: AlertCircle,
            title: 'This return link is not valid',
            body: 'The link may have been mistyped or replaced by a newer reminder email. Please sign in to the app and mark the item returned from your dashboard.',
          }
        : outcome === 'EXPIRED'
          ? {
              tone: 'warning' as const,
              icon: Clock,
              title: 'This return link has expired',
              body: 'For security, return links stop working after a while. Please sign in to the app and mark the item returned from your dashboard.',
            }
          : outcome === 'ALREADY_RETURNED'
            ? {
                tone: 'success' as const,
                icon: CheckCircle2,
                title: 'This equipment has already been marked as returned.',
                body: 'No further action is needed.',
              }
            : outcome === 'CANCELLED'
              ? {
                  tone: 'warning' as const,
                  icon: AlertCircle,
                  title: 'This borrowing record was cancelled',
                  body: 'There is nothing to return against it.',
                }
              : null

  if (problem) {
    const Icon = problem.icon
    return (
      <PublicLayout>
        <Card>
          <CardBody className="py-12 text-center">
            <div
              className={
                problem.tone === 'success'
                  ? 'mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600'
                  : problem.tone === 'warning'
                    ? 'mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600'
                    : 'mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600'
              }
            >
              <Icon className="h-7 w-7" aria-hidden />
            </div>
            <h1 className="mt-5 text-xl font-bold text-slate-900">{problem.title}</h1>
            <p className="mx-auto mt-2 max-w-sm text-slate-600">{problem.body}</p>
            <Link to="/" className="mt-6 inline-block">
              <Button variant="secondary">Open QK Equipment Tracking</Button>
            </Link>
          </CardBody>
        </Card>
      </PublicLayout>
    )
  }

  // ------------------------------------------------------------- the form
  return (
    <PublicLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Have you returned this equipment?
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Confirm below and attach a photo as proof.
          </p>
        </div>

        <Card>
          <dl className="divide-y divide-slate-100">
            <div className="flex justify-between gap-4 px-5 py-3 text-sm">
              <dt className="shrink-0 text-slate-500">Item</dt>
              <dd className="text-right font-semibold text-slate-900">{preview?.itemName}</dd>
            </div>
            <div className="flex justify-between gap-4 px-5 py-3 text-sm">
              <dt className="shrink-0 text-slate-500">Borrower</dt>
              <dd className="text-right font-medium text-slate-900">{preview?.borrowerName}</dd>
            </div>
            <div className="flex justify-between gap-4 px-5 py-3 text-sm">
              <dt className="shrink-0 text-slate-500">Borrowed from</dt>
              <dd className="text-right font-medium text-slate-900">{preview?.borrowedFrom}</dd>
            </div>
            <div className="flex justify-between gap-4 px-5 py-3 text-sm">
              <dt className="shrink-0 text-slate-500">Purpose</dt>
              <dd className="text-right text-slate-900">{preview?.purpose}</dd>
            </div>
            <div className="flex justify-between gap-4 px-5 py-3 text-sm">
              <dt className="shrink-0 text-slate-500">Expected return</dt>
              <dd className="text-right font-medium text-slate-900">
                {formatDate(preview?.expectedReturnDate ?? null)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardBody className="space-y-5">
            <ImageUpload
              files={files}
              onChange={setFiles}
              disabled={submitting}
              label="Return proof photo (required)"
              hint="A photo of the equipment back in place. Required before you can confirm."
            />

            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Returned to Console shelf 2, battery door cracked"
                disabled={submitting}
                maxLength={500}
              />
              <Hint>Note any damage or missing accessories.</Hint>
            </div>

            {submitError && <Alert tone="error">{submitError}</Alert>}

            {submitting && progress && (
              <ProgressBar
                percent={progress.percent}
                label={
                  progress.percent >= 95
                    ? 'Recording the return…'
                    : `Preparing photo ${progress.filesDone + 1} of ${progress.filesTotal}…`
                }
              />
            )}

            {/*
              Disabled until a photo is attached. The server enforces this too
              (redeem_return_token refuses with NO_PROOF), but blocking the
              button is clearer than letting someone press it and bounce off an
              error. aria-describedby carries the reason to screen readers,
              which otherwise get a disabled control with no explanation.
            */}
            <div>
              <Button
                size="lg"
                variant="success"
                onClick={handleSubmit}
                loading={submitting}
                disabled={files.length === 0}
                aria-describedby={files.length === 0 ? 'return-photo-required' : undefined}
                className="w-full"
              >
                <PackageCheck className="h-5 w-5" aria-hidden />
                {submitting ? 'Recording…' : 'Yes, I have returned this equipment'}
              </Button>

              {files.length === 0 && (
                <p
                  id="return-photo-required"
                  className="mt-2 text-center text-sm text-slate-500"
                >
                  Attach a return proof photo above to continue.
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </PublicLayout>
  )
}
