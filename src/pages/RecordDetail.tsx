import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, PackageCheck } from 'lucide-react'
import { data, DataError, type UploadProgress } from '@/lib/data'
import { useAuth } from '@/hooks/useAuth'
import { ImageUpload } from '@/components/ImageUpload'
import { ProofGallery } from '@/components/ProofGallery'
import { StatusBadge } from '@/components/StatusBadge'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Hint,
  Label,
  ProgressBar,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { describeDueDate } from '@/lib/status'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { BorrowingRecord } from '@/lib/types'

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  )
}

export default function RecordDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, session } = useAuth()

  const [record, setRecord] = useState<BorrowingRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [returning, setReturning] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    setLoading(true)

    data
      .getBorrowingRecordById(id)
      .then((r) => {
        if (!active) return
        // RLS returns nothing rather than an error when a user asks for
        // someone else's record, so "not found" covers both cases.
        if (!r) setLoadError('That record does not exist, or you do not have access to it.')
        setRecord(r)
      })
      .catch((e) => active && setLoadError(e instanceof Error ? e.message : 'Could not load the record.'))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [id])

  const handleReturn = async () => {
    if (!id) return
    setSubmitError(null)

    if (!files.length) {
      setSubmitError('Please attach at least one photo showing the returned equipment.')
      return
    }

    setSubmitting(true)
    setProgress({ percent: 0, currentFileName: '', filesDone: 0, filesTotal: files.length })

    try {
      const updated = await data.markAsReturned(id, files, notes, setProgress)
      setRecord(updated)
      setReturning(false)
      setFiles([])
      setNotes('')
    } catch (e) {
      setSubmitError(
        e instanceof DataError || e instanceof Error ? e.message : 'Could not record the return.',
      )
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (loadError || !record) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert tone="error" title="Record unavailable">
          {loadError ?? 'That record could not be found.'}
        </Alert>
        <Button variant="secondary" onClick={() => navigate('/')} className="mt-4">
          Back to dashboard
        </Button>
      </div>
    )
  }

  const isOwner = record.borrowerId === session?.user.id
  const canReturn = record.lifecycle === 'OPEN' && (isOwner || isAdmin)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/"
        className="focus-ring inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{record.itemName}</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wide text-slate-400">
            {record.recordCode}
          </p>
        </div>
        <StatusBadge status={record.status} />
      </div>

      {record.lifecycle === 'OPEN' && (
        <p
          className={
            record.status === 'OVERDUE' || record.status === 'DUE_TODAY'
              ? 'text-sm font-medium text-red-600'
              : 'text-sm text-slate-600'
          }
        >
          {describeDueDate(record.expectedReturnDate, record.lifecycle)}
        </p>
      )}

      <Card>
        <dl className="divide-y divide-slate-100">
          <DetailRow label="Borrower" value={record.borrowerName} />
          <DetailRow label="Email" value={<span className="break-all">{record.borrowerEmail}</span>} />
          <DetailRow label="Borrowed from" value={record.borrowedFrom} />
          <DetailRow label="Purpose" value={<span className="font-normal">{record.purpose}</span>} />
          <DetailRow label="Borrowed on" value={formatDateTime(record.borrowedAt)} />
          <DetailRow label="Expected return" value={formatDate(record.expectedReturnDate)} />
          {record.returnedAt && (
            <DetailRow label="Returned on" value={formatDateTime(record.returnedAt)} />
          )}
          {record.returnNotes && (
            <DetailRow
              label="Return notes"
              value={<span className="font-normal">{record.returnNotes}</span>}
            />
          )}
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <ProofGallery paths={record.borrowingProofPaths} label="Borrowing proof" />
          {record.lifecycle === 'RETURNED' && (
            <ProofGallery paths={record.returnProofPaths} label="Return proof" />
          )}
        </CardBody>
      </Card>

      {record.lifecycle === 'RETURNED' && (
        <Alert tone="success" title="This equipment has been returned">
          Recorded {formatDateTime(record.returnedAt)}
          {record.returnedByEmail && ` by ${record.returnedByEmail}`}.
        </Alert>
      )}

      {canReturn && !returning && (
        <Button size="lg" variant="success" onClick={() => setReturning(true)} className="w-full">
          <PackageCheck className="h-5 w-5" aria-hidden />
          Mark as returned
        </Button>
      )}

      {canReturn && returning && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm return</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <ImageUpload
              files={files}
              onChange={setFiles}
              disabled={submitting}
              label="Return proof photo"
              hint="A photo of the equipment back in place."
            />

            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Lens cap missing, returned to Console shelf 2"
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
                  progress.filesDone >= progress.filesTotal
                    ? 'Finishing up…'
                    : `Uploading photo ${progress.filesDone + 1} of ${progress.filesTotal}…`
                }
              />
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setReturning(false)
                  setFiles([])
                  setSubmitError(null)
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button variant="success" onClick={handleReturn} loading={submitting}>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {submitting ? 'Recording…' : 'Yes, I have returned this'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
