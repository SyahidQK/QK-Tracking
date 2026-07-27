/**
 * Reminder email templates.
 *
 * Table-based layout with inline styles: Outlook and the Gmail app strip
 * <style> blocks and ignore flexbox, so anything cleverer breaks in exactly
 * the clients this team uses.
 */
import type { EmailMessage } from './email.ts'

export interface ReminderContext {
  borrowerName: string
  borrowerEmail: string
  itemName: string
  borrowedFrom: string
  purpose: string
  expectedReturnDate: string // yyyy-MM-dd
  recordCode: string
  /** Absolute URL to the return confirmation page, token included. */
  returnUrl: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "30 July 2026" */
export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function shell(bodyRows: string, footerNote: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="background:#1f47ea;padding:20px 28px;">
                <span style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;background:#ffffff;color:#1f47ea;font-weight:700;font-size:13px;border-radius:8px;">QK</span>
                <span style="color:#ffffff;font-size:15px;font-weight:600;margin-left:10px;vertical-align:middle;">Equipment Tracking</span>
              </td>
            </tr>
            ${bodyRows}
            <tr>
              <td style="padding:0 28px 28px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">${footerNote}</p>
              </td>
            </tr>
          </table>
          <p style="max-width:560px;margin:16px auto 0;color:#94a3b8;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            You are receiving this because you recorded a borrowing in QK Equipment Tracking.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function detailsTable(ctx: ReminderContext): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;color:#64748b;font-size:14px;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:500;">${escapeHtml(value)}</td>
    </tr>`

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:4px 0 20px;">
    ${row('Item', ctx.itemName)}
    ${row('Borrowed from', ctx.borrowedFrom)}
    ${row('Purpose', ctx.purpose)}
    ${row('Expected return date', prettyDate(ctx.expectedReturnDate))}
    ${row('Record ID', ctx.recordCode)}
  </table>`
}

function ctaButton(url: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr>
      <td style="background:#059669;border-radius:8px;">
        <a href="${url}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">If the button does not work, copy this link:</p>
  <p style="margin:0 0 20px;word-break:break-all;"><a href="${url}" style="color:#1f47ea;font-size:12px;">${url}</a></p>`
}

const PLAIN_FOOTER = `Thank you,\nQK Equipment Tracking`

/** Reminder 1 — sent the day before the expected return date. */
export function reminderOne(ctx: ReminderContext): EmailMessage {
  const subject = `Reminder: Equipment Return Due Tomorrow — ${ctx.itemName}`

  const html = shell(
    `<tr>
      <td style="padding:28px 28px 0;">
        <p style="margin:0 0 14px;color:#0f172a;font-size:16px;">Hi ${escapeHtml(ctx.borrowerName)},</p>
        <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">
          This is a reminder that the following equipment is expected to be returned <strong>tomorrow</strong>:
        </p>
        ${detailsTable(ctx)}
        <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">
          Please ensure the equipment is returned on time.
        </p>
        <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">
          Already returned it? Confirm here and it will be closed off:
        </p>
        ${ctaButton(ctx.returnUrl, 'Confirm Equipment Return')}
        <p style="margin:0 0 6px;color:#334155;font-size:15px;">Thank you,</p>
        <p style="margin:0 0 20px;color:#334155;font-size:15px;font-weight:600;">QK Equipment Tracking</p>
      </td>
    </tr>`,
    'This link is unique to you and can only be used once.',
  )

  const text = `Hi ${ctx.borrowerName},

This is a reminder that the following equipment is expected to be returned tomorrow:

Item: ${ctx.itemName}
Borrowed From: ${ctx.borrowedFrom}
Purpose: ${ctx.purpose}
Expected Return Date: ${prettyDate(ctx.expectedReturnDate)}
Record ID: ${ctx.recordCode}

Please ensure the equipment is returned on time.

Already returned it? Confirm here:
${ctx.returnUrl}

${PLAIN_FOOTER}`

  return { to: ctx.borrowerEmail, subject, html, text }
}

/** Reminder 2 — sent on the expected return date. */
export function reminderTwo(ctx: ReminderContext): EmailMessage {
  const subject = 'Action Required: Have You Returned the Equipment?'

  const html = shell(
    `<tr>
      <td style="padding:28px 28px 0;">
        <p style="margin:0 0 14px;color:#0f172a;font-size:16px;">Hi ${escapeHtml(ctx.borrowerName)},</p>
        <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">
          Today is the expected return date for:
        </p>
        <p style="margin:0 0 4px;color:#0f172a;font-size:18px;font-weight:600;">${escapeHtml(ctx.itemName)}</p>
        ${detailsTable(ctx)}
        <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">
          If you have already returned the equipment, please click the button below to confirm the
          return and upload a return proof photo.
        </p>
        ${ctaButton(ctx.returnUrl, 'Confirm Equipment Return')}
        <p style="margin:0 0 6px;color:#334155;font-size:15px;">Thank you,</p>
        <p style="margin:0 0 20px;color:#334155;font-size:15px;font-weight:600;">QK Equipment Tracking</p>
      </td>
    </tr>`,
    'This link is unique to you and can only be used once.',
  )

  const text = `Hi ${ctx.borrowerName},

Today is the expected return date for:

${ctx.itemName}

Borrowed From: ${ctx.borrowedFrom}
Purpose: ${ctx.purpose}
Expected Return Date: ${prettyDate(ctx.expectedReturnDate)}
Record ID: ${ctx.recordCode}

If you have already returned the equipment, please confirm the return and upload a
return proof photo here:

${ctx.returnUrl}

${PLAIN_FOOTER}`

  return { to: ctx.borrowerEmail, subject, html, text }
}

/**
 * Overdue nudge — sent every few days after the due date has passed, capped.
 *
 * Deliberately plainer and firmer than the earlier two, but not accusatory:
 * the most common reason an item is still open is that someone returned it
 * and never told the system.
 */
export function reminderOverdue(ctx: ReminderContext, daysOverdue: number): EmailMessage {
  const dayWord = daysOverdue === 1 ? '1 day' : `${daysOverdue} days`
  const subject = `Still Outstanding: ${ctx.itemName} — ${dayWord} overdue`

  const html = shell(
    `<tr>
      <td style="padding:28px 28px 0;">
        <p style="margin:0 0 14px;color:#0f172a;font-size:16px;">Hi ${escapeHtml(ctx.borrowerName)},</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
          <tr>
            <td style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;">
              <p style="margin:0;color:#991b1b;font-size:15px;font-weight:600;">
                This equipment is ${dayWord} overdue.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 4px;color:#0f172a;font-size:18px;font-weight:600;">${escapeHtml(ctx.itemName)}</p>
        ${detailsTable(ctx)}
        <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.6;">
          If you have already returned it, please confirm below so we can close the record.
          If you still have it, please arrange to return it or let the team know when to expect it.
        </p>
        ${ctaButton(ctx.returnUrl, 'Confirm Equipment Return')}
        <p style="margin:0 0 6px;color:#334155;font-size:15px;">Thank you,</p>
        <p style="margin:0 0 20px;color:#334155;font-size:15px;font-weight:600;">QK Equipment Tracking</p>
      </td>
    </tr>`,
    'This link is unique to you and can only be used once.',
  )

  const text = `Hi ${ctx.borrowerName},

This equipment is ${dayWord} overdue.

${ctx.itemName}

Borrowed From: ${ctx.borrowedFrom}
Purpose: ${ctx.purpose}
Expected Return Date: ${prettyDate(ctx.expectedReturnDate)}
Record ID: ${ctx.recordCode}

If you have already returned it, please confirm here so we can close the record:

${ctx.returnUrl}

If you still have it, please arrange to return it or let the team know when to
expect it.

${PLAIN_FOOTER}`

  return { to: ctx.borrowerEmail, subject, html, text }
}
