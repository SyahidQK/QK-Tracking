import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { data } from '@/lib/data'
import { Skeleton } from '@/components/ui'

/**
 * Renders proof photos from the private bucket. Paths are exchanged for
 * short-lived signed URLs at view time — the images are never public.
 */
export function ProofGallery({ paths, label }: { paths: string[]; label: string }) {
  const [urls, setUrls] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    if (!paths.length) {
      setUrls([])
      return
    }
    setUrls(null)
    setFailed(false)

    data
      .getSignedUrls(paths)
      .then((u) => active && setUrls(u))
      .catch(() => active && setFailed(true))

    return () => {
      active = false
    }
  }, [paths])

  if (!paths.length) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
        <p className="text-sm text-slate-500">No photo attached.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>

      {failed && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <ImageOff className="h-4 w-4" aria-hidden />
          Photos could not be loaded right now.
        </p>
      )}

      {!failed && urls === null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {paths.map((p) => (
            <Skeleton key={p} className="aspect-[4/3] w-full" />
          ))}
        </div>
      )}

      {!failed && urls && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urls.map((url, i) => (
            <li key={url} className="overflow-hidden rounded-lg border border-slate-200">
              <a href={url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={url}
                  alt={`${label} ${i + 1}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition hover:opacity-90"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
