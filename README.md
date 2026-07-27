# QK Equipment Tracking

Internal tool for QK Console / QK Tech that replaces the WhatsApp-based equipment
borrowing process with a tracked, reminded, auditable workflow.

**→ Before anything else, read [SETUP.md](./SETUP.md).** It lists every credential
you still need to supply.

---

## What it does

1. Sign in with a Google account.
2. Record a borrowing: department, item, purpose, expected return date, proof photo.
3. The dashboard shows what you have out and what is overdue.
4. The day before the return date, an email reminder goes out.
5. On the return date, a second email arrives with a **Confirm Equipment Return**
   button.
6. That button opens a secure, single-use page where a return photo is uploaded
   and the record is closed.
7. If it still isn't returned, a nudge follows every 3 days — up to 5 times, then
   the system stops.

### Reminder timing

| When | Email |
|---|---|
| Due tomorrow | Heads-up |
| Due **today or earlier**, never emailed | Action email with the confirm button |
| Overdue, last contacted 3+ days ago | Nudge, capped at 5 |

The second row is `<=`, not `=`, on purpose. An exact date match silently skips
any record created after the job already ran on its own due date — which is the
normal case for same-day and short-notice borrowings. Those records would
otherwise go overdue having never received a single email.

A record gets at most one email per run, and returning it at any point stops all
of them.

---

## Architecture

```
Browser (React + TypeScript + Vite + Tailwind)
   │
   │  src/lib/data/  ← the ONLY place that knows about the backend
   ▼
Supabase
   ├── Postgres            borrowing records, profiles, return tokens, email log
   ├── Auth                Google OAuth (PKCE)
   ├── Storage             private bucket for proof photos, signed URLs on read
   ├── Edge Functions      return-confirm (public), send-reminders (cron-only)
   └── pg_cron + pg_net    fires the daily reminder job at 08:00 MYT
```

### Why not Google Sheets

The original brief specified Sheets + Apps Script. Supabase was chosen instead
because three requirements were expensive to satisfy on Sheets: secure single-use
return tokens with atomic redemption, private image storage with per-user access
control, and concurrent writes without row clobbering. Sheets would have worked at
this volume, but each of those needed hand-built machinery that Postgres provides
directly.

The data layer keeps that decision reversible — see below.

### Swapping the backend

Every backend call goes through the `DataProvider` interface in
`src/lib/data/types.ts`. No component imports a backend SDK. To move to Postgres,
Firebase, or a Sheets/Apps Script API later, implement that interface and change
one line in `src/lib/data/index.ts`.

---

## Project layout

```
src/
  lib/
    data/            data-access layer — the backend swap point
      types.ts         DataProvider interface + DataError
      supabaseProvider.ts
      index.ts         ← change this line to swap backends
    types.ts         domain types (no Supabase types leak into the UI)
    status.ts        status derivation + timezone handling
    images.ts        client-side validation and compression
    supabase.ts      client construction
  hooks/
    useAuth.tsx      session + profile + role
    useRecords.ts    filtered record loading, debounce
  components/        UI primitives, ImageUpload, RecordCard, ProofGallery, Layout
  pages/             Login, Dashboard, NewBorrowing, RecordDetail,
                     ReturnConfirmation, AdminRecords, AuthCallback
supabase/
  functions/
    _shared/         email providers, templates, CORS
    return-confirm/  public token-verified return endpoint
    send-reminders/  daily job
```

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/login` | public | Google sign-in |
| `/auth/callback` | public | OAuth landing |
| `/return/:token` | public | Return confirmation from the email link |
| `/` | signed in | Dashboard |
| `/new` | signed in | Create borrowing record |
| `/record/:id` | signed in | Detail + in-app return |
| `/admin` | admin only | All records across all borrowers |

---

## Data model

`public.borrowing_records`

| column | notes |
|---|---|
| `record_code` | `EQ-2026-0001`, generated, unique, resets per year |
| `borrower_id` | FK to `auth.users`; RLS pins this to the JWT subject |
| `borrower_name`, `borrower_email` | captured at creation |
| `borrowed_from` | department name, denormalised so history survives renames |
| `item_name`, `purpose` | non-blank enforced by CHECK |
| `expected_return_date` | date |
| `lifecycle` | `OPEN` / `RETURNED` / `CANCELLED` — the only stored state |
| `borrowing_proof_paths`, `return_proof_paths` | storage paths, not URLs |
| `reminder_1_sent_at`, `reminder_2_sent_at` | duplicate-send guards |
| `returned_at`, `returned_by_email`, `return_notes` | |

Supporting tables: `profiles` (with `role`), `departments`, `return_tokens`,
`email_log`, `record_counters`.

### Status is derived, never stored

`ACTIVE`, `DUE_SOON`, `DUE_TODAY`, `OVERDUE` all depend on today's date, so
storing them would mean a nightly job just to keep them honest. Instead
`derive_status()` computes them in the `borrowing_records_view`, and the client
recomputes on render so a dashboard left open overnight doesn't show a stale
badge.

All date logic is anchored to **Asia/Kuala_Lumpur** in both the database and the
client. Using UTC would flip a record to overdue at 08:00 local time.

---

## Security

- **RLS is deny-by-default on every table.** A normal user can read and write only
  their own records; admins are gated behind `private.is_admin()`.
- **`return_tokens` and `record_counters` have RLS enabled with zero policies** —
  deliberately unreachable from the browser. Only `SECURITY DEFINER` functions
  granted to `service_role` can touch them.
- **`SECURITY DEFINER` helpers live in a `private` schema**, so PostgREST does not
  expose them as `/rest/v1/rpc/...` endpoints.
- **Return tokens**: 256 bits of entropy, stored only as a SHA-256 hash, single-use,
  expiring, and superseded whenever a newer reminder is sent. Redemption takes a
  row lock, so two people clicking the same link cannot both close the record.
- **Proof photos** live in a private bucket. Reads require a signed URL, and the
  storage policy keys on the owner's uid being the first path segment.
- **The service role key never reaches the browser.** The public return endpoint is
  an Edge Function precisely so the browser never needs elevated rights.
- **Uploads are validated twice** — MIME type and size in the browser, and again
  server-side by the bucket's `allowed_mime_types` and `file_size_limit`.

---

## Edge cases handled

| Case | Behaviour |
|---|---|
| Missing item / purpose / date | Inline field errors, focus moves to the first problem |
| Return date in the past | Rejected with an explanation |
| Return date > 6 months out | Warns but allows — usually a typo in the year |
| Unsupported file type | Named, human-readable rejection |
| Oversized image | Rejected client-side; also capped by the bucket |
| Phone photo sideways | EXIF orientation applied during compression |
| Upload fails midway | Already-uploaded files removed, record insert rolled back |
| Database insert fails after upload | Photos deleted, nothing orphaned |
| Email send fails | Logged to `email_log`, reminder flag left unset so tomorrow retries |
| Borrowed and due the same day | Caught by the `<=` window; still gets the action email |
| Item never returned | Nudged every 3 days, capped at 5, then left to the admin view |
| Adding a column to `borrowing_records` | Recreate `borrowing_records_view` — `r.*` is resolved at creation and will not pick it up |
| Expired return link | "This return link has expired", pointed to the app |
| Already-returned link | "This equipment has already been marked as returned." |
| Two people return at once | Compare-and-set; the loser is told it's already done |
| Accessing someone else's record | RLS returns nothing; UI shows a clean not-found |
| Network lost mid-submit | "nothing was saved" message, safe to retry |
| Render crash | Error boundary instead of a white screen |

---

## Not built yet

Phases 4–5 from the brief are deliberately out of scope for this pass. The
foundations are in place for each:

- **Admin equipment availability** — needs an `equipment` catalogue table; today
  `item_name` is free text, which is right for an MVP but can't answer "is the FX3
  free next Tuesday".
- **Analytics and utilisation reports** — `email_log` and the record history hold
  the raw data already.
- **Editing an expected return date** — `updateBorrowingRecord()` exists in the
  data layer and is RLS-permitted, but has no UI yet.
- **Rate limiting on the public return endpoint** — tokens are unguessable, so this
  is a denial-of-service concern rather than an access one.

---

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

> The frontend was written and hand-audited but **not compiled** — the environment
> it was built in had no access to the npm registry. Run `npm install && npm run
> build` first; treat any error there as a genuine bug to fix, not a config quirk.
> The database logic *was* exercised directly against the live schema (25 checks
> covering status derivation, token issue/peek/redeem, replay, expiry, concurrent
> return, and the reminder queues).
