/**
 * Pluggable email delivery.
 *
 * Two providers are supported; the first one configured wins:
 *
 *  1. Gmail SMTP  — set GMAIL_USER and GMAIL_APP_PASSWORD.
 *     Sends from a real company Gmail address with no domain setup.
 *     Requires 2-Step Verification plus an App Password.
 *     Free Gmail: ~500 recipients/day. Workspace: ~2000/day.
 *
 *  2. Resend      — set RESEND_API_KEY and RESEND_FROM.
 *     Better deliverability and bounce handling, but the sending domain
 *     must be verified in Resend first.
 *
 * Swapping providers is a secrets change, not a code change.
 */
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export type EmailProvider = 'gmail' | 'resend' | 'none'

export function detectProvider(): EmailProvider {
  if (Deno.env.get('RESEND_API_KEY')) return 'resend'
  if (Deno.env.get('GMAIL_USER') && Deno.env.get('GMAIL_APP_PASSWORD')) return 'gmail'
  return 'none'
}

const FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'QK Equipment Tracking'

async function sendViaResend(msg: EmailMessage): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY')!
  const from = Deno.env.get('RESEND_FROM')
  if (!from) throw new Error('RESEND_FROM is not set (e.g. "QK Tracking <tracking@yourdomain.com>")')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  })

  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${await res.text()}`)
  }
}

/**
 * Collapse the template's newlines and indentation into a single line.
 *
 * denomailer encodes HTML as quoted-printable. Lines that end in whitespace
 * get encoded as a literal `=20`, which some clients then render as visible
 * text instead of decoding back to a space — so a pretty-printed template
 * arrives peppered with "=20". Removing the line structure removes the
 * trailing whitespace that triggers it.
 *
 * Joining with a space rather than an empty string matters: prose wrapped
 * across two source lines would otherwise fuse into "confirm thereturn".
 * HTML collapses runs of whitespace anyway, so layout is unaffected.
 */
function compactHtml(html: string): string {
  return html
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
}

async function sendViaGmail(msg: EmailMessage): Promise<void> {
  const user = Deno.env.get('GMAIL_USER')!
  const password = Deno.env.get('GMAIL_APP_PASSWORD')!

  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: user, password },
    },
  })

  try {
    await client.send({
      from: `${FROM_NAME} <${user}>`,
      to: msg.to,
      subject: msg.subject,
      // The plain-text part keeps its line breaks on purpose — only the
      // HTML part is compacted.
      content: msg.text,
      html: compactHtml(msg.html),
    })
  } finally {
    // Leaking the connection would eventually exhaust the function's sockets.
    //
    // denomailer's close() returns void, not a Promise, so `.catch()` on it
    // throws TypeError — and because this sits in `finally`, that error
    // replaces the real outcome and makes a delivered email look failed.
    // try/catch around an awaited value handles both shapes safely.
    try {
      await client.close()
    } catch {
      // Cleanup failure is not worth failing a delivered email over.
    }
  }
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  switch (detectProvider()) {
    case 'resend':
      return sendViaResend(msg)
    case 'gmail':
      return sendViaGmail(msg)
    default:
      throw new Error(
        'No email provider configured. Set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY + RESEND_FROM.',
      )
  }
}
