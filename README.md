# DD Busy Bees

School management web app for DD Busy Bees Montessori school (Ghana).

- **Owner and office**: today's dashboard (children in, staff on site, ratio alerts, overdue fees, incidents), children and enrolment, enquiry pipeline, fees and payments, parent messages, notices and calendar, oversight (logging coverage, overdue upkeep), staff, rota and clock-ins, lesson plans, termly reports, classes, curriculum, upkeep tasks and settings.
- **Teachers**: check-in and check-out (parent PIN or pick-up list), one-tap activity logs with photos, upkeep tasks, incident reports, lesson plans, report drafts written from their logs, QR clock-in. Teachers cannot message anyone.
- **Parents**: their child's day with photos, progress by curriculum area and shared reports, fees with Paystack mobile money and card payments, messages to the office, notices and calendar, the enrolment form, pick-up PIN and SMS settings.
- **Public**: enquiry form at `/enquire`.

Design: https://claude.ai/code/artifact/2001570c-8d0a-46f4-a0f7-c081915e5223

Going live (Supabase, Vercel, SMS, Paystack): see [docs/SETUP.md](docs/SETUP.md).

## Development

```
npm ci
cp .env.example .env.local   # fill in a Supabase project's keys
npm run dev
```

Checks (the same as CI):

```
npm run lint && npm run typecheck && npm test && npm run build
```

`npm test` also runs the database access-rule tests when `TEST_DATABASE_URL` points at a
Postgres server where the user can create databases (CI provides one). They apply every
migration and check, role by role, who can read and write what.

## How it fits together

- Next.js (App Router) on Vercel, TypeScript throughout, Tailwind CSS.
- Supabase Postgres with row-level security on every table: a bug in a screen can't
  show one family another family's data. Migrations live in `supabase/migrations/`.
- Money is stored in pesewas. Paystack payments are only marked paid after Paystack's
  signed webhook or a server-to-server verify, with the amount checked.
- SMS goes through Arkesel; every automatic SMS is sent at most once (see `src/lib/notify.ts`).
- Scheduled jobs are in `vercel.json` and `src/app/api/cron/`.
