import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { data, DataError, type UploadProgress } from '@/lib/data'
import { ImageUpload } from '@/components/ImageUpload'
import {
  Alert,
  Button,
  Card,
  CardBody,
  FieldError,
  Hint,
  Input,
  Label,
  ProgressBar,
  Select,
  Textarea,
} from '@/components/ui'
import { appToday, daysBetween } from '@/lib/status'
import { formatDate } from '@/lib/utils'
import type { BorrowingRecord, Department } from '@/lib/types'

interface FormErrors {
  borrowedFrom?: string
  itemName?: string
  purpose?: string
  expectedReturnDate?: string
}

export default function NewBorrowing() {
  const { profile, session } = useAuth()
  const navigate = useNavigate()

  const [departments, setDepartments] = useState<Department[]>([])
  const [deptError, setDeptError] = useState<string | null>(null)

  const [borrowedFrom, setBorrowedFrom] = useState('')
  const [itemName, setItemName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState<BorrowingRecord | null>(null)

  const today = appToday()

  const borrowerName = profile?.fullName ?? session?.user.email?.split('@')[0] ?? ''
  const borrowerEmail = profile?.email ?? session?.user.email ?? ''

  useEffect(() => {
    let active = true
    data
      .listDepartments()
      .then((d) => {
        if (!active) return
        setDepartments(d)
        // Only one option? Pre-select it and save the user a tap.
        if (d.length === 1 && d[0]) setBorrowedFrom(d[0].name)
      })
      .catch((e) => active && setDeptError(e instanceof Error ? e.message : 'Could not load departments.'))
    return () => {
      active = false
    }
  }, [])

  // Warn (but don't block) on a return date that's suspiciously far out —
  // usually a typo in the year.
  const dateWarning = useMemo(() => {
    if (!expectedReturnDate) return null
    const diff = daysBetween(today, expectedReturnDate)
    if (diff > 180) return 'That is more than six months away. Double-check the date is right.'
    return null
  }, [expectedReturnDate, today])

  const validate = (): boolean => {
    const next: FormErrors = {}

    if (!borrowedFrom) next.borrowedFrom = 'Choose which department the item came from.'
    if (!itemName.trim()) next.itemName = 'Enter the name of the equipment.'
    else if (itemName.trim().length < 2) next.itemName = 'That name looks too short.'
    if (!purpose.trim()) next.purpose = 'Describe the event or reason for borrowing.'

    if (!expectedReturnDate) {
      next.expectedReturnDate = 'Choose the expected return date.'
    } else if (Number.isNaN(Date.parse(expectedReturnDate))) {
      next.expectedReturnDate = 'That date is not valid.'
    } else if (daysBetween(today, expectedReturnDate) < 0) {
      next.expectedReturnDate = 'The return date cannot be in the past.'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) {
      // Move focus to the problem so mobile users aren't left staring at a
      // form that "did nothing".
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }

    setSubmitting(true)
    setProgress(files.length ? { percent: 0, currentFileName: '', filesDone: 0, filesTotal: files.length } : null)

    try {
      const record = await data.createBorrowingRecord(
        {
          borrowedFrom,
          departmentId: departments.find((d) => d.name === borrowedFrom)?.id ?? null,
          itemName,
          purpose,
          expectedReturnDate,
          proofFiles: files,
        },
        setProgress,
      )
      setCreated(record)
    } catch (err) {
      setSubmitError(
        err instanceof DataError || err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  // ---------------------------------------------------------------- success
  if (created) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardBody className="py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" aria-hidden />
            </div>

            <h1 className="mt-5 text-xl font-bold text-slate-900">
              Equipment borrowing recorded successfully.
            </h1>

            <dl className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200 text-left text-sm">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Item</dt>
                <dd className="text-right font-medium text-slate-900">{created.itemName}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Expected return</dt>
                <dd className="text-right font-medium text-slate-900">
                  {formatDate(created.expectedReturnDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Borrowing ID</dt>
                <dd className="text-right font-mono text-xs font-medium text-slate-900">
                  {created.recordCode}
                </dd>
              </div>
            </dl>

            <p className="mt-5 text-sm text-slate-500">
              We will email you the day before it is due, and again on the day itself.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => navigate('/')}>Back to dashboard</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreated(null)
                  setItemName('')
                  setPurpose('')
                  setFiles([])
                  setErrors({})
                }}
              >
                Record another
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------- form
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/"
        className="focus-ring mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Dashboard
      </Link>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Borrow equipment</h1>
      <p className="mt-1 text-sm text-slate-600">
        Takes about a minute. This replaces the WhatsApp message.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <Card>
          <CardBody className="space-y-5">
            {/* Borrower — read-only, taken from the session. */}
            <div>
              <Label>Borrower</Label>
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200">
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                    {borrowerName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{borrowerName}</p>
                  <p className="truncate text-xs text-slate-500">{borrowerEmail}</p>
                </div>
              </div>
              <Hint>Reminder emails will be sent to this address.</Hint>
            </div>

            <div>
              <Label htmlFor="borrowedFrom">
                Borrowed from <span className="text-red-500">*</span>
              </Label>
              <Select
                id="borrowedFrom"
                value={borrowedFrom}
                onChange={(e) => {
                  setBorrowedFrom(e.target.value)
                  setErrors((x) => ({ ...x, borrowedFrom: undefined }))
                }}
                aria-invalid={!!errors.borrowedFrom}
                disabled={submitting || !!deptError}
              >
                <option value="">Select a department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <FieldError>{errors.borrowedFrom}</FieldError>
              {deptError && (
                <Alert tone="warning" className="mt-2">
                  {deptError}
                </Alert>
              )}
            </div>

            <div>
              <Label htmlFor="itemName">
                Item <span className="text-red-500">*</span>
              </Label>
              <Input
                id="itemName"
                value={itemName}
                onChange={(e) => {
                  setItemName(e.target.value)
                  setErrors((x) => ({ ...x, itemName: undefined }))
                }}
                placeholder="e.g. Sony FX3 Camera"
                aria-invalid={!!errors.itemName}
                disabled={submitting}
                maxLength={120}
                autoComplete="off"
              />
              <FieldError>{errors.itemName}</FieldError>
            </div>

            <div>
              <Label htmlFor="purpose">
                Purpose <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="purpose"
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value)
                  setErrors((x) => ({ ...x, purpose: undefined }))
                }}
                placeholder="e.g. ABC Company Annual Dinner at KLCC"
                aria-invalid={!!errors.purpose}
                disabled={submitting}
                maxLength={500}
              />
              <FieldError>{errors.purpose}</FieldError>
            </div>

            <div>
              <Label htmlFor="expectedReturnDate">
                Expected return date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="expectedReturnDate"
                type="date"
                value={expectedReturnDate}
                min={today}
                onChange={(e) => {
                  setExpectedReturnDate(e.target.value)
                  setErrors((x) => ({ ...x, expectedReturnDate: undefined }))
                }}
                aria-invalid={!!errors.expectedReturnDate}
                disabled={submitting}
              />
              <FieldError>{errors.expectedReturnDate}</FieldError>

              {expectedReturnDate && !errors.expectedReturnDate && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                  <Info className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  Due <span className="font-medium">{formatDate(expectedReturnDate)}</span>
                </p>
              )}
              {dateWarning && (
                <Alert tone="warning" className="mt-2">
                  {dateWarning}
                </Alert>
              )}
            </div>

            <ImageUpload
              files={files}
              onChange={setFiles}
              disabled={submitting}
              label="Borrowing proof photo"
              hint="Photo of the equipment as it leaves. JPG, PNG or WEBP, up to 10 MB each."
            />
          </CardBody>
        </Card>

        {submitError && (
          <Alert tone="error" title="Could not save the record">
            {submitError}
          </Alert>
        )}

        {submitting && progress && (
          <Card>
            <CardBody>
              <ProgressBar
                percent={progress.percent}
                label={
                  progress.filesDone >= progress.filesTotal
                    ? 'Finishing up…'
                    : `Uploading photo ${progress.filesDone + 1} of ${progress.filesTotal}…`
                }
              />
            </CardBody>
          </Card>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to="/" className="sm:w-auto">
            <Button type="button" variant="secondary" className="w-full" disabled={submitting}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" loading={submitting} className="w-full sm:w-auto">
            {submitting ? 'Saving…' : 'Record borrowing'}
          </Button>
        </div>
      </form>
    </div>
  )
}
