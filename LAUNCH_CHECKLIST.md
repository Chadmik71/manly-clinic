# Launch checklist — Manly Remedial Thai

Single operator, real patient data, real money. Don't ship until everything in **§1 Blockers** is ticked. §2 is set up shortly after launch. §3 is good hygiene to run quarterly.

---

## 1. Blockers — do not accept a real customer until these are green

### Payments (Stripe)

- [ ] **`STRIPE_SECRET_KEY` is a live key** (`sk_live_…`, not `sk_test_…`). Check Vercel → Settings → Environment Variables for the Production environment.
- [ ] **`STRIPE_PUBLISHABLE_KEY` is live** (`pk_live_…`).
- [ ] **`STRIPE_WEBHOOK_SECRET` is set** and the webhook endpoint `https://www.manlyremedialthai.com.au/api/stripe/webhook` is registered in Stripe dashboard → Developers → Webhooks, listening for `payment_intent.succeeded` and `payment_intent.payment_failed`.
- [ ] **Real-money end-to-end test**: book a session yourself with a real card, pay the $30 deposit, then refund it manually via Stripe dashboard. Verify the booking creates and the refund settles to your card within 5–10 days.
- [ ] **Stripe payouts** are going to the correct Australian bank account (Stripe dashboard → Balance → Settings).
- [ ] **ABN / tax settings** in Stripe match the clinic's registration (Stripe dashboard → Business settings → Public details).
- [ ] **GST handling** — if the clinic is GST-registered, confirm whether each treatment is GST-applicable and that Stripe / invoices reflect this correctly (massage therapy may be GST-free; check with the accountant).

### Email (Resend)

- [ ] **`RESEND_API_KEY` is set** in Vercel production env vars.
- [ ] **Sender domain is verified** in Resend dashboard for `manlyremedialthai.com.au`. DKIM, SPF, and a DMARC record are published in DNS.
- [ ] **`EMAIL_FROM` env var matches a verified address**, e.g. `bookings@manlyremedialthai.com.au`.
- [ ] **Real send test**: book a session and confirm the email lands in Gmail, Outlook, and iCloud inboxes (not spam folders). If it lands in spam, fix DMARC alignment before going live.
- [ ] **Privacy-officer mailbox** (`privacy@manlyremedialthai.com.au` per `lib/clinic.ts`) is **monitored**. Privacy Act obligates response within 30 days.

### SMS (Twilio)

- [ ] **`TWILIO_*` env vars** are set: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (must be a verified AU sender).
- [ ] **AU sender ID is approved** by Twilio. Trial-mode accounts only send to verified numbers — confirm the account is upgraded out of trial.
- [ ] **Real SMS test** sent to your own mobile from a real booking.

### Database (Neon)

- [ ] **Paid Neon tier** with **point-in-time recovery ≥ 7 days** (Launch plan or higher). Free tier is not adequate for production health data.
- [ ] **Backup confirmed by actually restoring once** — spin up a branch at a past timestamp via Neon dashboard to confirm PITR works.
- [ ] **Connection pool** sized appropriately. The pooler URL is what the app uses; verify it's not the direct connection.
- [ ] **`DATABASE_URL` in Vercel** is the pooler URL (host contains `-pooler.`).

### Privacy Act / APP compliance

- [ ] **Privacy policy live** at `/privacy` and current (effective date matches reality). Mention cross-border data flow (Resend US, Twilio US) — already done in the deployed page.
- [ ] **Consent UI** captures treatment + storage consent on every booking — wired in the booking confirm form.
- [ ] **Audit log working** — view a few rows in `AuditLog` table to confirm staff actions (VIEW_HEALTH_INFO, UPDATE_BOOKING_STATUS, etc.) are being recorded.
- [ ] **Data-residency check** — Neon project is in `ap-southeast-2` (Sydney). ✓ already confirmed.
- [ ] **Data breach response plan documented** somewhere outside this repo. OAIC notification within 72 hours of suspected serious harm.

### Hosting (Vercel)

- [ ] **Pro plan, not Hobby** — Hobby's commercial-use restriction would put the site at risk of throttling/shutdown. ($20/mo)
- [ ] **Production domain** `www.manlyremedialthai.com.au` has a valid SSL cert auto-managed by Vercel.
- [ ] **Apex (`manlyremedialthai.com.au` without `www`) redirects to `www`** (or vice-versa, but they shouldn't both serve separate content).

### Real-world walkthrough (the most important block)

- [ ] **End-to-end customer flow as a stranger** — fresh incognito window, fresh email, book a Remedial slot, fill the intake, sign for HiCAPS claim, pay the deposit, get the email + SMS, view the booking in `/portal`, reschedule once, cancel once.
- [ ] **HiCAPS-claim flow with a real fund + member number**. Don't ship without confirming the signature renders correctly on the invoice PDF and the claim metadata is captured.
- [ ] **Walk-in booking** via `/staff/bookings/new` from the staff portal, including the new HiCAPS-at-counter signature capture.
- [ ] **Voucher**: purchase one, activate after payment, redeem at booking confirm. Already smoke-tested but eyeball the email rendering.
- [ ] **No-show / late-cancel** path — manually create a booking that's about to start, cancel via the portal, verify the 50% fee message is correct (you don't have to actually charge it yourself, just confirm the policy enforces).

### Cron jobs

- [ ] **`/api/cron/reminders`** is scheduled in Vercel (`vercel.json`) and running. Check Vercel → Crons tab.
- [ ] **`/api/cron/complete-past-bookings`** same.
- [ ] **`CRON_SECRET`** env var is set; cron endpoints reject unauthenticated calls.

---

## 2. Within the first week of launch

### Monitoring

- [ ] **Vercel deployment-rollback** bookmarked. If a bad deploy ships, Vercel → Deployments → previous good deploy → "Promote to Production" is a one-click roll-back.
- [ ] **Vercel runtime logs** — check daily for 500s and error-rate spikes.
- [ ] **Stripe dashboard** — set email alerts for failed payments, disputed charges.
- [ ] Consider **Sentry** or similar for error tracking. Low priority for solo operator, but a 500 in the booking flow that you don't notice means lost revenue.

### Operations

- [ ] **Phone number on the site is monitored** and the voicemail is set up. Cancellations and lates may come in by phone.
- [ ] **`info@manlyremedialthai.com.au` inbox** is monitored.
- [ ] **You know how to reach Neon support** — bookmark the dashboard, know the project ID.

### Customer-facing polish

- [ ] **Google Business Profile** is current — hours, photos, response to recent reviews. `googlePlaceId` in `lib/clinic.ts` is set, so reviews are pulled into the home page.
- [ ] **Sitemap submitted** to Google Search Console.
- [ ] **First five real customers**: actively follow up to make sure email + SMS landed, intake felt smooth, no payment surprises.

---

## 3. Quarterly hygiene

- [ ] **Rotate `SMOKE_ADMIN_PASSWORD` / `SMOKE_CLIENT_PASSWORD`** via the `--regenerate` scripts (kept in `scripts/` for re-use, or re-create if deleted). Update `.env.smoke`.
- [ ] **Run the smoke** against prod after any non-trivial release: `npm run smoke`.
- [ ] **Review `AuditLog` table** — purge entries older than 7 years per healthcare retention rules; surface anything that looks like unauthorised access.
- [ ] **Privacy policy review** — date stamp + an actual read-through.
- [ ] **Backup-restore drill** — confirm PITR still works by spinning up a Neon branch from 24h ago.
- [ ] **Dependency updates** — `npm outdated`, plan upgrades (especially Next.js, Prisma, NextAuth).
- [ ] **Test cancellation policy** still matches Terms + FAQ + `lib/clinic.ts` `CANCEL_FEE_PERCENT`.

---

## Quick-reference: secrets you need handy

Stored offline (password manager), not on disk in plain text:

- Prod `DATABASE_URL` (Neon pooler URL)
- Vercel API token (if you ever script deploys)
- Stripe live secret + webhook secret
- Resend API key
- Twilio account SID + auth token
- Smoke admin + smoke client passwords (the values printed when you ran `scripts/create-smoke-staff.ts` / `create-smoke-client.ts`)

If your laptop dies tonight, can you recover all of these from your password manager? If no, fix that before launch.
