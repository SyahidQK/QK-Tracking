# Setup — what you must provide

The application code is complete and the database is already provisioned. What is
**not** done is the handful of credentials only you can create. Nothing is faked:
if a key below is missing, the corresponding feature returns a clear error rather
than pretending to work.

Work through these in order. Steps 1–3 get you a working app; steps 4–5 turn on
the reminder emails.

---

## Your Supabase project

Already created and migrated:

| | |
|---|---|
| Project ref | `mhxkxuczgybdoiglodvu` |
| URL | `https://mhxkxuczgybdoiglodvu.supabase.co` |
| Region | Singapore (`ap-southeast-1`) |
| Dashboard | https://supabase.com/dashboard/project/mhxkxuczgybdoiglodvu |

Publishable (anon) key — safe to ship in the browser bundle:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oeGt4dWN6Z3liZG9pZ2xvZHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NDU1ODYsImV4cCI6MjEwMDUyMTU4Nn0.PXCMqW-kunw6VY8HPri9GP8l9gY-DPg0OG_lYyfXVig
```

> The **service role** key is different and must never appear in this repo, in
> `.env`, or in any frontend code. It is only ever read by Edge Functions, which
> receive it automatically from the platform.

---

## 1. Google OAuth credentials — REQUIRED

Without this, nobody can sign in.

**a. Google Cloud Console → create the OAuth client**

1. Go to https://console.cloud.google.com/apis/credentials
2. Select or create a project (e.g. "QK Equipment Tracking").
3. **OAuth consent screen** → External → fill in app name, support email, developer
   email. Add scopes `userinfo.email`, `userinfo.profile`, `openid`.
   - While the app is in *Testing* mode only accounts you list as test users can
     sign in. Click **Publish app** once you are ready for the whole team.
4. **Credentials → Create Credentials → OAuth client ID → Web application.**
5. Under **Authorised redirect URIs** add exactly:

   ```
   https://mhxkxuczgybdoiglodvu.supabase.co/auth/v1/callback
   ```

6. Copy the **Client ID** and **Client secret**.

**b. Supabase → enable the provider**

1. Dashboard → **Authentication → Sign In / Providers → Google** → enable.
2. Paste the Client ID and Client secret. Save.

**c. Supabase → Authentication → URL Configuration**

- **Site URL**: `http://localhost:5173` for now; change to your Vercel URL after
  deploying.
- **Redirect URLs** — add both:
  ```
  http://localhost:5173/auth/callback
  https://YOUR-APP.vercel.app/auth/callback
  ```

> Login will fail with `redirect_uri_mismatch` if the URI in step (a5) does not
> match character for character, or if the callback URL is missing here.

---

## 2. Frontend environment — REQUIRED

```bash
cp .env.example .env
```

Then fill in:

```env
VITE_SUPABASE_URL=https://mhxkxuczgybdoiglodvu.supabase.co
VITE_SUPABASE_ANON_KEY=<the publishable key above>
VITE_APP_URL=http://localhost:5173
```

```bash
npm install
npm run dev
```

You should be able to sign in, record a borrowing with a photo, open the record,
and mark it returned. **Phases 1 and 2 are now fully working.**

---

## 3. Make yourself an admin — OPTIONAL

Sign in once so your profile row exists, then run this in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'amirulsyahid0@gmail.com';
```

Sign out and back in. An "All records" tab appears.

---

## 4. Email provider — REQUIRED FOR REMINDERS

Pick **one**. Set these as **Edge Function secrets**:
Dashboard → **Project Settings → Edge Functions → Secrets**.

### Option A — Gmail SMTP (simplest, recommended to start)

Sends from a real company Gmail address. No domain setup.

1. On the sending Google account, turn on **2-Step Verification**.
2. Go to https://myaccount.google.com/apppasswords and create an App Password.
3. Add secrets:

| Name | Value |
|---|---|
| `GMAIL_USER` | `equipment@yourcompany.com` |
| `GMAIL_APP_PASSWORD` | the 16-character app password, no spaces |
| `MAIL_FROM_NAME` | `QK Equipment Tracking` |

Limits: ~500 recipients/day on free Gmail, ~2,000/day on Workspace. Far above
what this app will use.

### Option B — Resend (better deliverability)

1. Create an account at https://resend.com, verify your sending domain.
2. Add secrets:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | `re_...` |
| `RESEND_FROM` | `QK Equipment Tracking <tracking@yourcompany.com>` |

If both are set, Resend wins.

---

## 5. Reminder job configuration — REQUIRED FOR REMINDERS

Same secrets page. Add:

| Name | Value | Why |
|---|---|---|
| `APP_URL` | `https://YOUR-APP.vercel.app` | Used to build the return links in emails. Get this wrong and every button in every email is broken. No trailing slash. |
| `CRON_SECRET` | see below | Authenticates the scheduled job |
| `ALLOWED_ORIGINS` | `https://YOUR-APP.vercel.app,http://localhost:5173` | Locks down CORS on the public return endpoint |
| `RETURN_TOKEN_TTL_DAYS` | `30` | Optional. How long a return link stays valid. |
| `MAX_OVERDUE_NUDGES` | `5` | Optional. How many follow-up emails an overdue item gets before the system stops chasing. |
| `OVERDUE_NUDGE_INTERVAL_DAYS` | `3` | Optional. Days between those follow-ups. |

**The `CRON_SECRET` value** was generated and stored in your database's Vault
already. Read it back with this query and paste the result into the secret:

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';
```

To rotate it later, update both places:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_secret'),
  encode(extensions.gen_random_bytes(32), 'hex')
);
```
…then paste the new value into the `CRON_SECRET` Edge Function secret.

### Verify the reminder job

Dry run — reports what *would* be sent without sending anything:

```bash
curl -X POST https://mhxkxuczgybdoiglodvu.supabase.co/functions/v1/send-reminders \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true}'
```

Live run:

```bash
curl -X POST https://mhxkxuczgybdoiglodvu.supabase.co/functions/v1/send-reminders \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" -d '{}'
```

The schedule is already registered in `pg_cron` and fires at **00:00 UTC = 08:00
Malaysia time** daily. Check it with:

```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;
```

Every send attempt, success or failure, is recorded in `public.email_log`.

---

## 6. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Vercel → **New Project** → import the repo. Framework preset: **Vite**
   (`vercel.json` already sets the build command, output directory and SPA
   rewrites).
3. Environment variables:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://mhxkxuczgybdoiglodvu.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the publishable key above |
   | `VITE_APP_URL` | your production URL, no trailing slash |

4. Deploy, then go back and update:
   - Supabase → Auth → **Site URL** and **Redirect URLs** (add
     `https://YOUR-APP.vercel.app/auth/callback`)
   - Edge Function secrets → `APP_URL` and `ALLOWED_ORIGINS`

---

## Checklist

- [ ] Google OAuth client created, redirect URI matches exactly
- [ ] Google provider enabled in Supabase with client ID + secret
- [ ] Site URL and redirect URLs configured
- [ ] `.env` filled in, `npm install && npm run dev` works, sign-in succeeds
- [ ] Your account promoted to admin
- [ ] Email provider secrets set (Gmail **or** Resend)
- [ ] `APP_URL`, `CRON_SECRET`, `ALLOWED_ORIGINS` set
- [ ] Dry run returns `"sent":0` with no error
- [ ] Deployed to Vercel; production URLs added back to Supabase and secrets

---

## Recovering the migration files

The five migrations are applied to the live database but not checked into this
repo. To materialise them into `supabase/migrations/`:

```bash
npm install -g supabase
supabase link --project-ref mhxkxuczgybdoiglodvu
supabase db pull
```

Do this before making further schema changes, so your history stays linear.
