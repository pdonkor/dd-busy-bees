# Security review, load test and backup restore

Before the school goes live, and again once a year, work through this page.

## What was reviewed (November 2026)

The whole app was read with these questions in mind. Where something needed fixing it
was fixed in the same change; what's left needs the live accounts.

**Logins**
- Teachers and parents log in with an SMS code; owner and office with email, password
  and an authenticator app. Every owner/office page and action checks two-step
  verification (`requireRole` in `src/lib/auth.ts`), and so does the database
  (`private.is_admin` requires `aal2`), so a stolen password alone opens nothing.
- Accounts come only from invites: single use, 7-day expiry, stored as a hash. Office
  invites are emailed and never shown on screen, so whoever sets the password has
  proved they own the mailbox.
- The SMS-code hook only texts active accounts' Ghanaian numbers, so it can't be used to
  run up the SMS bill or find out who is registered.

**Who can see what**
- Row-level security on every table, tested role by role in `tests/db/rls.test.ts`
  (runs in CI). Anonymous users can read nothing.
- Code that bypasses row-level security (the "service role" client) was checked one by
  one: each use either runs after a role check and a row-level-security read that
  proves access, or is a signed webhook, a cron job with its secret, or the public
  enquiry form.
- Teachers can't message anyone and never see family phone numbers or fees.

**Money**
- A Paystack payment is only marked paid after a signed webhook or a server-to-server
  verify, with the amount and currency checked against what was asked for; settling
  twice does nothing. Payments and invoices can only be voided, never edited, and only
  by the owner.
- Online payments are capped at GHS 50,000 to catch typos.

**Browser**
- Content-Security-Policy with a fresh script nonce on every page (no inline scripts
  can run), plus HSTS, no framing, no MIME sniffing.
- Photos are private: re-encoded (location data removed) and shown through links that
  expire after an hour, only for children with photo consent.
- Pick-up PINs are hashed and lock after 5 wrong tries a day; clock-in QR codes change
  every 30 seconds and need the phone to be on the premises.
- The public enquiry form has a hidden bot trap, an optional Cloudflare Turnstile check
  and a limit of 3 an hour per address.

**Still to do with the live accounts**
- In Supabase: turn on **Leaked password protection** (Authentication → Policies), keep
  the default rate limits for SMS and email, and check **Advisors → Security** shows no
  warnings after the migrations run.
- Run the load test and the backup restore below, and note the dates here.
- Consider registering with Ghana's Data Protection Commission (Act 843).

## Load test

Uses [k6](https://k6.io/docs/get-started/installation/). Test a staging copy (a second
Supabase project and a Vercel preview), never the live school.

1. Create a test teacher and a test parent in staging and log in as each in a browser.
   In the browser's developer tools, copy the `sb-…-auth-token` cookie values.
2. Run:
   ```
   k6 run -e BASE_URL=https://<staging address> \
     -e PARENT_COOKIE='sb-<ref>-auth-token=<value>' \
     -e TEACHER_COOKIE='sb-<ref>-auth-token=<value>' \
     scripts/load/k6.js
   ```
3. It simulates ten times the busiest 10 minutes (the 4 pm summary SMS): 1,000 parent
   visits, 50 teachers and steady public traffic. It passes when fewer than 1% of
   requests fail and 95% answer within 1.5 seconds. If it fails, check Supabase's
   **Reports** for slow queries before upgrading anything.

## Backup restore drill

Supabase Pro keeps a backup of every day for the last 7 days. Prove once that a backup
actually restores:

1. In the live project: **Database → Backups**, note yesterday's backup.
2. Create a new, empty Supabase project ("restore-test") and, from the live project's
   backup page, choose **Restore to a new project** with that backup (or download it and
   load it with `psql` into the new project).
3. Point a local copy of the app at the restored project (`.env.local`) and check: you
   can log in as the owner, children and their logs are there, and the fee balances
   match the live app's **Fees** page.
4. Delete the restore-test project, and write the date and result here.

| Date | What | Result |
| ---- | ---- | ------ |
|      |      |        |
