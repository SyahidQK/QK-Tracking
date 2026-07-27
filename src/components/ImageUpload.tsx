import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import {
  ACCEPTED_EXTENSIONS,
  formatBytes,
  ImageValidationError,
  MAX_FILES,
  validateFile,
} from '@/lib/images'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/utils'

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
  maxFiles?: number
  label?: string
  hint?: string
}

/**
 * Drag-and-drop / tap-to-capture image picker with previews.
 *
 * `capture="environment"` on the camera input opens the rear camera directly
 * on phones — the common case is someone standing next to the gear.
 */
export function ImageUpload({
  files,
  onChange,
  disabled,
  maxFiles = MAX_FILES,
  label = 'Proof photos',
  hint,
}: Props) {
  const [previews, setPreviews] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  // Object URLs must be revoked or the tab leaks memory as photos are swapped.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(URL.revokeObjectURL)
  }, [files])

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming?.length) return
      setError(null)

      const accepted: File[] = []
      for (const file of Array.from(incoming)) {
        try {
          validateFile(file)
        } catch (e) {
          setError(e instanceof ImageValidationError ? e.message : 'That file could not be added.')
          continue
        }
        // Cheap duplicate guard for the "picked the same photo twice" case.
        const isDuplicate = files.some((f) => f.name === file.name && f.size === file.size)
        if (!isDuplicate) accepted.push(file)
      }

      if (!accepted.length) return

      const next = [...files, ...accepted]
      if (next.length > maxFiles) {
        setError(`You can attach up to ${maxFiles} photos.`)
        onChange(next.slice(0, maxFiles))
        return
      }
      onChange(next)
    },
    [files, maxFiles, onChange],
  )

  const remove = (index: number) => {
    setError(null)
    onChange(files.filter((_, i) => i !== index))
  }

  const atLimit = files.length >= maxFiles

  return (
    <div>
      <p className="mb-1.5 block text-sm font-medium text-slate-700">{label}</p>

      {!atLimit && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!disabled) addFiles(e.dataTransfer.files)
          }}
          className={cn(
            'rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
            dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/60',
            disabled && 'opacity-60',
          )}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
              <ImagePlus className="h-5 w-5" aria-hidden />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => cameraRef.current?.click()}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:hidden"
              >
                <Camera className="h-4 w-4" aria-hidden />
                Take photo
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => galleryRef.current?.click()}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" aria-hidden />
                Choose photo
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {hint ?? 'JPG, PNG or WEBP · up to 10 MB each'}
              {maxFiles > 1 && ` · ${files.length}/${maxFiles} added`}
            </p>
          </div>
        </div>
      )}

      <input
        ref={galleryRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        multiple={maxFiles > 1}
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = '' // allows re-picking the same file
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {error && (
        <Alert tone="warning" className="mt-3">
          {error}
        </Alert>
      )}

      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${i}`}
              className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
            >
              <div className="aspect-[4/3] w-full">
                {previews[i] && (
                  <img
                    src={previews[i]}
                    alt={`Preview of ${file.name}`}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 bg-white px-2 py-1.5">
                <span className="truncate text-[11px] text-slate-500" title={file.name}>
                  {formatBytes(file.size)}
                </span>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${file.name}`}
                  className="focus-ring absolute right-1.5 top-1.5 rounded-full bg-slate-900/70 p-1 text-white backdrop-blur transition hover:bg-slate-900"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {atLimit && (
        <p className="mt-2 text-xs text-slate-500">
          Maximum of {maxFiles} photos reached. Remove one to add another.
        </p>
      )}
    </div>
  )
}
