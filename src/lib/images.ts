/**
 * Client-side image validation and compression.
 *
 * Phone cameras produce 4–12 MB JPEGs. Uploading those raw would be slow on
 * event-venue wifi and would burn through storage for no benefit — proof
 * photos only need to be legible. We downscale to 1600px on the long edge
 * and re-encode as JPEG, which typically lands under 400 KB.
 *
 * createImageBitmap with imageOrientation:'from-image' applies the EXIF
 * rotation, so portrait phone photos don't come out sideways.
 */

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.webp'

/** Rejected before any work happens. Matches the bucket's server-side limit. */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_FILES = 5

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

export class ImageValidationError extends Error {}

export function validateFile(file: File): void {
  if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
    throw new ImageValidationError(
      `"${file.name}" is not a supported image. Please use a JPG, PNG or WEBP file.`,
    )
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageValidationError(
      `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_INPUT_BYTES)}. ` +
        `Try taking the photo at a lower resolution.`,
    )
  }
  if (file.size === 0) {
    throw new ImageValidationError(`"${file.name}" appears to be empty.`)
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function compressImage(file: File): Promise<File> {
  validateFile(file)

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Corrupt file, or a browser that can't decode this codec.
    throw new ImageValidationError(
      `"${file.name}" could not be read as an image. It may be corrupted.`,
    )
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file // No canvas support — fall back to the original.
  }

  // White matte: PNGs with transparency would otherwise go black as JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )

  if (!blob) return file
  // If compression somehow made it bigger, keep the original.
  if (blob.size >= file.size && file.type === 'image/jpeg') return file

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
}
