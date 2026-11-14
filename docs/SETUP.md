# Going live: setup steps

These are the steps that need the school's own accounts. Each takes 5–20 minutes.
Do them in order; the app works with test keys first, so nothing real is charged
or texted until you switch to live keys at the end.

## 1. Supabase (database, logins, photo storage)

1. Sign up at supabase.com and create a project on the **Pro** plan (daily backups).
   Region: **West EU (Paris)** or **West EU (London)**, the closest to Ghana. Save the
   database password somewhere safe.
2. In **Project Settings → API**, copy the Project URL, the `anon` key and the
   `service_role` key. These become `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Create the tables: either run `npx supabase link --project-ref <ref>` then
   `npx supabase db push` from this repo, or open **SQL Editor** and run each file in
   `supabase/migrations/` in name order. The last one also creates the private
   `media` bucket for photos.
4. **Authentication → Sign In / Providers**: turn **Phone** on and turn
   **Allow new users to sign up** off (accounts come only from invites).
5. **Authentication → Multi-Factor**: turn on **TOTP (authenticator app)**.
6. **Authentication → Hooks → Send SMS hook**: type HTTPS, URL
   `https://<your app address>/api/hooks/send-sms`. Generate the secret and copy it
   into `SEND_SMS_HOOK_SECRET`. (Do this after step 2 below, once the app has an address.)

## 2. Vercel (hosting)

1. Sign up at vercel.com with the GitHub account that owns `pdonkor/dd-busy-bees` and
   import the repository. Use the **Pro** plan (the free plan is for non-commercial use,
   and the scheduled jobs need Pro).
2. In **Settings → Environment Variables**, add every name from `.env.example`.
   Generate `CLOCK_QR_SECRET` and `CRON_SECRET` with `openssl rand -base64 48`
   (or any password generator, 40+ characters).
3. Deploy. Add your domain (for example `app.ddbusybees.com`) under **Settings → Domains**
   and set `APP_URL` to it.
4. The scheduled jobs in `vercel.json` start automatically: the parent SMS summary at
   16:00 on school days, and a 06:00 job that issues termly invoices on the first day of
   term and sends overdue-fee reminders on Mondays.

## 3. Arkesel (SMS)

1. Create an account at arkesel.com, buy a small bundle of SMS credit.
2. Register the sender ID **BusyBees** (approval can take a few days).
3. Copy the API key into `ARKESEL_API_KEY`.

## 4. Resend (email)

Office (admin) invites are only ever sent by email, and parents can choose to get
receipts by email too.

1. Create an account at resend.com.
2. **Domains → Add domain**: add the school's domain (for example `ddbusybees.com`) and
   add the DNS records it shows at your domain registrar. Wait for it to say *Verified*.
3. **API Keys → Create**: copy it into `RESEND_API_KEY`, and set `EMAIL_FROM` to an
   address on that domain, for example `DD Busy Bees <office@ddbusybees.com>`.

## 5. Paystack (mobile money and card payments)

1. Create a Paystack Ghana business account and complete the compliance form (business
   registration, bank or MoMo account for payouts).
2. **Settings → API Keys & Webhooks**: copy the **test** secret key into
   `PAYSTACK_SECRET_KEY`, and set the webhook URL to
   `https://<your app address>/api/webhooks/paystack`.
3. Try a payment from a parent test account with Paystack's test MoMo number or test card.
   The invoice should show as paid within seconds and a receipt SMS should arrive.
4. When Paystack approves the account, swap in the **live** secret key and redeploy.

## 6. Create the owner account

From this repo, with `.env.local` filled in:

```
npm run create-owner -- --school "DD Busy Bees" --name "Your Name" --email you@example.com
```

Log in at the app address, scan the QR code with Google Authenticator or Authy, and
you're in.

## 7. First day in the app (owner)

1. **Settings**: stand at the entrance and press *Use this device's location*, so staff
   can only clock in on the premises.
2. **Classes** (with children-per-adult ratios) and **Curriculum** areas and materials.
3. **Fees → Fee plans and terms**: termly fees, uniform and other one-off charges, the
   daily feeding rate, the sibling discount, and the term dates.
4. **Staff**: invite teachers by phone and set their hours in **Staff on site**.
5. **Children**: add each child (or share the enquiry form at `/enquire`), choose their
   fee plan and feeding plan on their **Fees** page, and invite their parents.
6. **Upkeep tasks**: press *Add Ghana starter list* and edit it.
7. Open **Staff on site → Open entrance QR screen** on a tablet or old phone at the entrance.

## Before opening to families

Work through [SECURITY.md](SECURITY.md): the Supabase security settings, the load test
and a backup restore.

## Optional

- **Cloudflare Turnstile** bot check on the enquiry form: create a widget at
  dash.cloudflare.com and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
- **Data Protection Commission**: the school may need to register as a data controller
  under Ghana's Data Protection Act, 2012 (Act 843).
