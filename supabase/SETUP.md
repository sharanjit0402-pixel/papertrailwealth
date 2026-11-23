# Money challenges: backend setup

The challenge pages work right away in **on-device mode** (progress saved in the
visitor's browser). These steps switch on **accounts, synced progress and
automatic emails**.

## 1. Create the Supabase project
1. supabase.com → New project → name `papertrail`, region **East US** (closest to the audience).
2. **SQL Editor** → paste `supabase/migrations/0001_challenges.sql` → Run.

## 2. Login emails from hello@papertrailwealth.com
**Authentication → Emails → SMTP Settings** → enable custom SMTP:
- Host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key
- Sender email `hello@papertrailwealth.com`, sender name `The Paper Trail`

**Authentication → URL Configuration**
- Site URL: `https://papertrailwealth.com`
- Redirect URLs: `https://papertrailwealth.com/challenges/**`

**Authentication → Emails → Templates → Magic Link**: subject `Your Paper Trail login link`,
body: "Tap to open your money challenges: {{ .ConfirmationURL }}"

## 3. Email functions
**Edge Functions** → create `welcome`, `notify`, `unsubscribe` from the files in
`supabase/functions/` (each one needs `_shared/email.ts` alongside it).
- Turn **off** "Verify JWT with legacy secret" on all three (the functions check
  the user themselves; `notify` only sends between 6 and 7 PM US Eastern).
- **Edge Functions → Secrets**: add `RESEND_API_KEY` (a Resend sending key).

## 4. Call `notify` every hour
In SQL Editor (replace PROJECT_REF):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('challenge-emails', '0 * * * *', $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/notify',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

**Live setup (Nov 2026):** project `trail` (yygtzzcglfytukdrkcqp, West US). Steps 1–5 are
done; the only manual item is the `RESEND_API_KEY` secret.

## 5. Connect the website
In `src/site.ts`, paste the **Project URL** and **anon public key**
(Project Settings → API) into `SUPABASE`, commit and push. Cloudflare redeploys automatically.

## Seeing your data
**Table Editor → challenge_dashboard** shows every person, their challenge,
check-ins, total saved and last activity. Export to CSV from there anytime.
