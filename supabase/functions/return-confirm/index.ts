/**
 * Public return-confirmation endpoint.
 *
 * Runs with verify_jwt = false because the person clicking the link from their
 * email is not signed in. The token IS the credential:
 *   - 256 bits of entropy, so it cannot be guessed
 *   - stored only as a SHA-256 hash, so a database leak cannot forge one
 *   - single-use and expiring, enforced atomically in redeem_return_token()
 *
 * The service-role key never leaves this function.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, json } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'equipment-proofs'

const MAX_FILES = 5
const MAX_DECODED_BYTES = 8 * 1024 * 1024 // 8 MB per image after decoding
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface IncomingFile {
  name: string
  dataUrl: string
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([a-z0-9/+.-]+);base64,(.*)$/i.exec(dataUrl)
  if (!match) throw new Error('Malformed image data.')

  const mime = (match[1] ?? '').toLowerCase()
  if (!ALLOWED_MIME.has(mime)) throw new Error('Unsupported image type.')

  const binary = atob(match[2] ?? '')
  if (binary.length > MAX_DECODED_BYTES) throw new Error('Image is too large.')

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  return { bytes, mime }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let body: { action?: string; token?: string; notes?: string | null; files?: IncomingFile[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400, origin)
  }

  const token = typeof body.token === 'string' ? body.token : ''
  // Cheap shape check before touching the database.
  if (!token || token.length < 20 || token.length > 200) {
    return json({ outcome: 'INVALID' }, 200, origin)
  }

  // ------------------------------------------------------------- preview
  if (body.action === 'preview') {
    const { data, error } = await supabase.rpc('peek_return_token', { p_raw_token: token })

    if (error) {
      console.error('peek_return_token failed', error)
      return json({ error: 'Lookup failed.' }, 500, origin)
    }

    const row = Array.isArray(data) ? data[0] : null
    if (!row) return json({ outcome: 'INVALID' }, 200, origin)

    // Only fields the page actually renders. Nothing else about the record
    // is exposed to an unauthenticated caller.
    return json(
      {
        outcome: row.outcome,
        recordCode: row.outcome === 'OK' ? row.record_code : null,
        borrowerName: row.outcome === 'OK' ? row.borrower_name : null,
        borrowedFrom: row.outcome === 'OK' ? row.borrowed_from : null,
        itemName: row.item_name ?? null,
        purpose: row.outcome === 'OK' ? row.purpose : null,
        expectedReturnDate: row.outcome === 'OK' ? row.expected_return_date : null,
        status: row.status ?? null,
      },
      200,
      origin,
    )
  }

  // -------------------------------------------------------------- submit
  if (body.action === 'submit') {
    const files = Array.isArray(body.files) ? body.files : []

    if (files.length === 0) return json({ outcome: 'NO_PROOF' }, 200, origin)
    if (files.length > MAX_FILES) {
      return json({ error: `Attach no more than ${MAX_FILES} photos.` }, 400, origin)
    }

    // Re-check the token before spending time on uploads.
    const { data: peekData, error: peekError } = await supabase.rpc('peek_return_token', {
      p_raw_token: token,
    })
    if (peekError) {
      console.error('peek_return_token failed', peekError)
      return json({ error: 'Lookup failed.' }, 500, origin)
    }

    const peek = Array.isArray(peekData) ? peekData[0] : null
    if (!peek || peek.outcome !== 'OK') {
      return json({ outcome: peek?.outcome ?? 'INVALID' }, 200, origin)
    }

    const recordId = peek.record_id as string

    const { data: record, error: recordError } = await supabase
      .from('borrowing_records')
      .select('borrower_id, borrower_email')
      .eq('id', recordId)
      .single()

    if (recordError || !record) {
      console.error('record lookup failed', recordError)
      return json({ outcome: 'INVALID' }, 200, origin)
    }

    // Same path convention as the signed-in upload path, so RLS-based reads
    // by the owner and by admins keep working.
    const uploaded: string[] = []
    try {
      for (const file of files) {
        const { bytes, mime } = decodeDataUrl(file.dataUrl)
        const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
        const path = `${record.borrower_id}/${recordId}/return/${crypto.randomUUID()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, bytes, { contentType: mime, upsert: false })

        if (uploadError) throw new Error(uploadError.message)
        uploaded.push(path)
      }
    } catch (e) {
      if (uploaded.length) {
        await supabase.storage.from(BUCKET).remove(uploaded).catch(() => undefined)
      }
      console.error('upload failed', e)
      return json(
        { error: e instanceof Error ? e.message : 'Photo upload failed. Please try again.' },
        400,
        origin,
      )
    }

    const { data: redeemData, error: redeemError } = await supabase.rpc('redeem_return_token', {
      p_raw_token: token,
      p_proof_paths: uploaded,
      p_notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
      p_actor_email: record.borrower_email,
    })

    if (redeemError) {
      await supabase.storage.from(BUCKET).remove(uploaded).catch(() => undefined)
      console.error('redeem_return_token failed', redeemError)
      return json({ error: 'Could not record the return. Please try again.' }, 500, origin)
    }

    const result = Array.isArray(redeemData) ? redeemData[0] : null
    if (!result || result.outcome !== 'OK') {
      // Someone beat us to it. Clean up the now-orphaned images.
      await supabase.storage.from(BUCKET).remove(uploaded).catch(() => undefined)
      return json({ outcome: result?.outcome ?? 'INVALID' }, 200, origin)
    }

    return json(
      { outcome: 'OK', recordCode: result.record_code, itemName: result.item_name },
      200,
      origin,
    )
  }

  return json({ error: 'Unknown action.' }, 400, origin)
})
