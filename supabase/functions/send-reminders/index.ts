/**
 * Daily reminder job.
 *
 * Invoked once a day by pg_cron (see the schedule_reminders migration).
 * Protected by a shared secret header rather than a JWT, because the caller
 * is the database, not a user.
 *
 * Three kinds of email, in priority order. A record receives at most ONE
 * email per run — the batches are processed in order and already-emailed
 * records are skipped, so nobody gets two messages the same morning.
 *
 *   1. Due tomorrow          — heads-up.
 *   2. Due today or earlier  — the action email, with the confirm button.
 *      Note this is `<=`, not `=`. An exact match silently skips any record
 *      created after the job ran on its own due date, which is common for
 *      same-day and short-notice borrowings.
 *   3. Overdue nudge         — every N days after that, capped, so a
 *      forgotten item keeps surfacing instead of going quiet.
 *
 * Guarantees:
 *   - Only OPEN records are considered, so returning early stops the emails.
 *   - Send flags are stamped only after a successful send, so a re-run never
 *     double-sends and a failure is retried on the next run.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { sendEmail, detectProvider } from '../_shared/email.ts'
import {
  reminderOne,
  reminderTwo,
  reminderOverdue,
  type ReminderContext,
} from '../_shared/templates.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
const TOKEN_TTL_DAYS = Number(Deno.env.get('RETURN_TOKEN_TTL_DAYS') ?? '30')

/** How many overdue nudges before we stop, and how far apart. */
const MAX_OVERDUE_NUDGES = Number(Deno.env.get('MAX_OVERDUE_NUDGES') ?? '5')
const OVERDUE_NUDGE_INTERVAL_DAYS = Number(Deno.env.get('OVERDUE_NUDGE_INTERVAL_DAYS') ?? '3')

const TIMEZONE = 'Asia/Kuala_Lumpur'

/** Today and tomorrow in app time, as yyyy-MM-dd. */
function appDates() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const now = new Date()
  return {
    today: fmt.format(now),
    tomorrow: fmt.format(new Date(now.getTime() + 86_400_000)),
  }
}

/** Whole days between two yyyy-MM-dd strings (b - a). */
function daysBetween(a: string, b: string): number {
  const toUtc = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1)
  }
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

type ReminderKind = 1 | 2 | 'overdue'

interface RecordRow {
  id: string
  record_code: string
  borrower_name: string
  borrower_email: string
  borrowed_from: string
  item_name: string
  purpose: string
  expected_return_date: string
  overdue_reminders_sent?: number
}

Deno.serve(async (req) => {
  // ---- authenticate the caller ----
  if (!CRON_SECRET) {
    console.error('CRON_SECRET is not set; refusing to run.')
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 })
  }
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  if (!APP_URL) {
    console.error('APP_URL is not set; return links would be broken.')
    return new Response(JSON.stringify({ error: 'APP_URL not configured' }), { status: 500 })
  }

  const provider = detectProvider()
  if (provider === 'none') {
    console.error('No email provider configured.')
    return new Response(JSON.stringify({ error: 'No email provider configured. See SETUP.md.' }), {
      status: 500,
    })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { today, tomorrow } = appDates()
  const summary = {
    provider,
    today,
    sent: 0,
    failed: 0,
    skipped: 0,
    details: [] as string[],
  }

  // Optional: allow a manual dry run for testing.
  let dryRun = false
  try {
    const body = await req.json()
    dryRun = body?.dryRun === true
  } catch {
    // No body is the normal cron case.
  }

  const columns =
    'id, record_code, borrower_name, borrower_email, borrowed_from, item_name, ' +
    'purpose, expected_return_date, overdue_reminders_sent'

  // ---- 1. due tomorrow ----
  const { data: dueTomorrow, error: e1 } = await supabase
    .from('borrowing_records')
    .select(columns)
    .eq('lifecycle', 'OPEN')
    .eq('expected_return_date', tomorrow)
    .is('reminder_1_sent_at', null)

  // ---- 2. due today OR already past due and never told ----
  const { data: dueNow, error: e2 } = await supabase
    .from('borrowing_records')
    .select(columns)
    .eq('lifecycle', 'OPEN')
    .lte('expected_return_date', today)
    .is('reminder_2_sent_at', null)

  // ---- 3. overdue nudges ----
  const { data: nudges, error: e3 } = await supabase.rpc('overdue_nudge_queue', {
    p_max_nudges: MAX_OVERDUE_NUDGES,
    p_interval_days: OVERDUE_NUDGE_INTERVAL_DAYS,
  })

  if (e1 || e2 || e3) {
    console.error('Failed to read records', e1 ?? e2 ?? e3)
    return new Response(JSON.stringify({ error: 'Could not read borrowing records.' }), {
      status: 500,
    })
  }

  const batches: { records: RecordRow[]; kind: ReminderKind }[] = [
    { records: (dueTomorrow ?? []) as RecordRow[], kind: 1 },
    { records: (dueNow ?? []) as RecordRow[], kind: 2 },
    { records: (nudges ?? []) as RecordRow[], kind: 'overdue' },
  ]

  // One email per record per run, even if it qualifies for two batches.
  const emailedThisRun = new Set<string>()

  for (const { records, kind } of batches) {
    for (const record of records) {
      if (emailedThisRun.has(record.id)) {
        summary.skipped++
        summary.details.push(`${record.record_code}: already emailed this run, skipping ${kind}`)
        continue
      }

      if (!record.borrower_email) {
        summary.skipped++
        summary.details.push(`${record.record_code}: no email address on record`)
        continue
      }

      const daysOverdue = daysBetween(record.expected_return_date, today)

      if (dryRun) {
        summary.skipped++
        summary.details.push(
          `${record.record_code}: would send ${
            kind === 'overdue' ? `overdue nudge (${daysOverdue}d late)` : `reminder ${kind}`
          }`,
        )
        emailedThisRun.add(record.id)
        continue
      }

      try {
        // A fresh token per email supersedes any earlier unused one, so an old
        // reminder in the inbox stops working once a newer one is sent.
        const { data: rawToken, error: tokenError } = await supabase.rpc('issue_return_token', {
          p_record_id: record.id,
          p_ttl_days: TOKEN_TTL_DAYS,
        })
        if (tokenError || !rawToken) throw new Error(tokenError?.message ?? 'token issue failed')

        const ctx: ReminderContext = {
          borrowerName: record.borrower_name,
          borrowerEmail: record.borrower_email,
          itemName: record.item_name,
          borrowedFrom: record.borrowed_from,
          purpose: record.purpose,
          expectedReturnDate: record.expected_return_date,
          recordCode: record.record_code,
          returnUrl: `${APP_URL}/return/${encodeURIComponent(rawToken as string)}`,
        }

        const message =
          kind === 1
            ? reminderOne(ctx)
            : kind === 2
              ? reminderTwo(ctx)
              : reminderOverdue(ctx, daysOverdue)

        await sendEmail(message)
        emailedThisRun.add(record.id)

        // Stamp only after the send succeeded.
        const patch: Record<string, unknown> =
          kind === 1
            ? { reminder_1_sent_at: new Date().toISOString() }
            : kind === 2
              ? { reminder_2_sent_at: new Date().toISOString() }
              : {
                  last_overdue_reminder_at: new Date().toISOString(),
                  overdue_reminders_sent: (record.overdue_reminders_sent ?? 0) + 1,
                }

        const { error: stampError } = await supabase
          .from('borrowing_records')
          .update(patch)
          .eq('id', record.id)

        if (stampError) {
          // The email went out; log loudly so a duplicate tomorrow is explainable.
          console.error(
            `Sent ${kind} for ${record.record_code} but failed to stamp`,
            stampError,
          )
        }

        await supabase.from('email_log').insert({
          record_id: record.id,
          recipient: record.borrower_email,
          kind: kind === 'overdue' ? 'REMINDER_OVERDUE' : `REMINDER_${kind}`,
          subject: message.subject,
          status: 'SENT',
        })

        summary.sent++
        summary.details.push(
          `${record.record_code}: ${
            kind === 'overdue' ? `overdue nudge (${daysOverdue}d late)` : `reminder ${kind}`
          } sent`,
        )
      } catch (e) {
        const errorText = e instanceof Error ? e.message : String(e)
        console.error(`Reminder ${kind} failed for ${record.record_code}`, errorText)

        await supabase.from('email_log').insert({
          record_id: record.id,
          recipient: record.borrower_email,
          kind: kind === 'overdue' ? 'REMINDER_OVERDUE' : `REMINDER_${kind}`,
          status: 'FAILED',
          error: errorText.slice(0, 500),
        })

        summary.failed++
        summary.details.push(`${record.record_code}: ${kind} FAILED — ${errorText}`)
      }
    }
  }

  console.log('Reminder run complete', JSON.stringify(summary))

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
