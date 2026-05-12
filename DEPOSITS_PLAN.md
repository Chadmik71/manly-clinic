# Online deposit feature — implementation plan

Status: **partially shipped**. This document tracks what's done, what's left, and the open decisions for finishing the online-deposit feature for the public booking flow.

Last updated: paused mid-build during Mick's morning shift, May 2026.

---

## What customers experience today

**No change.** All commits so far are dormant — gated behind environment variables that aren't set. Customers booking online see exactly the same flow they always have, with no card field, no payment step.

---

## Business rules (decided with Mick)

- Deposit amount: **flat $30** per online booking (not a percentage).
- Charged at: **the moment of booking**, before booking is confirmed.
- Online only: walk-in bookings remain pay-at-clinic, no card needed.
- Refund logic: **follow the cancellation policy** — cancellations with at least 1 hour's notice get auto-refunded; cancellations inside the 1-hour window OR no-shows forfeit the $30.
- No-shows: keep the $30 (matches cancellation policy fee logic).

## Payment processor

- **Stripe**, AUD account, live mode.
- Stripe account confirmed verified during the May 2026 session — publishable key visible on the dashboard, AUD balance card present, no warning banners.
- All work being done in **Stripe test mode first** to avoid touching real money during development.

---

## Commits shipped so far

| # | Commit | What it does |
|---|---|---|
| 1 | `chore(deps): add @stripe/react-stripe-js for deposit card UI` | Adds the React wrapper for Stripe Elements to package.json. Pinned to `^4.0.0` for compatibility with `@stripe/stripe-js ^9.3.1` already installed. No code uses it yet. |
| 2 | `feat(stripe): switch depositCents to flat $30 + add depositsEnabled feature flag` | `lib/stripe.ts` — replaces the percentage-based deposit formula with a flat amount (defaults to 3000 cents, overridable via `DEPOSIT_CENTS` env var). Adds `depositsEnabled()` helper that returns true only when both `STRIPE_SECRET_KEY` is set AND `NEXT_PUBLIC_DEPOSITS_ENABLED === "true"`. |

Both are live in production, both are dormant — no caller in the codebase references the new helper yet.

## Commits still to do

### Commit 3 — Add Stripe Elements card UI to the booking confirm form

**File:** `app/(public)/book/confirm/confirm-form.tsx` (~1000 lines)

The confirm form currently has:
- A standard React form with `<form ref={formRef} onSubmit={onSubmit}>`
- An `onSubmit` handler that builds a FormData object and calls `await action(formData)` (where `action` is a prop, wired to the `createBooking` server action by the parent page)
- A useTransition hook: `const [pending, start] = useTransition()`
- After successful submit, two branches:
  - Guest path: `setGuestSuccess(true)` + scroll to top (renders success card in-place)
  - Logged-in path: `window.location.href = "/portal/bookings/confirmed?ref=" + res.reference`

Changes needed:

1. Add imports from `@stripe/react-stripe-js` and `@stripe/stripe-js` — `loadStripe`, `Elements`, `PaymentElement`, `useStripe`, `useElements`.
2. Add state: `clientSecret`, `paymentError`, `paymentStage` (one of `'idle' | 'card' | 'paying' | 'done'`).
3. Gate everything on `process.env.NEXT_PUBLIC_DEPOSITS_ENABLED === "true"` — if false, render exactly the current flow.
4. **Architecture decision needed**: Option A vs Option B (see below).

### Commit 4 — Wire `actions.ts createBooking` to deposit flow

**File:** `app/(public)/book/confirm/actions.ts`

When deposits are enabled, `createBooking` needs to call `/api/bookings/[id]/deposit` to create a PaymentIntent, and return the `clientSecret` to the client so the card form can collect payment.

The existing scaffolded route at `app/api/bookings/[id]/deposit/route.ts` already does this (creates PaymentIntent, returns clientSecret), so the work is wiring `createBooking` to call it after creating the booking row.

### Commit 5 — Refund-on-cancel logic

**Files:** wherever cancellations are processed (probably `app/api/bookings/[id]/route.ts` or a similar cancellation endpoint).

When a booking is cancelled:
- If `booking.paymentIntentId` is set AND cancellation is at least 1 hour before `booking.startsAt` → call `stripe.refunds.create({ payment_intent })` for the full $30.
- If less than 1 hour OR no-show → no refund (matches policy).
- The booking row already has `cancellationFeeCents` field — use it to record the kept amount.

The existing `notify.ts` cancellation email already has "within 1h of start" wording from earlier commits today, so the email side is aligned.

---

## Architecture decision pending — Option A vs Option B

This needs to be resolved before Commit 3 starts.

### Option A — Deposit BEFORE booking is created (recommended)

```
Customer fills form → clicks Book
  → onSubmit fetches a PaymentIntent up front (no booking row yet)
  → card form revealed
  → customer enters card → clicks "Pay $30 and confirm"
  → stripe.confirmPayment() succeeds
  → THEN createBooking is called server-side with paymentIntentId already known
  → booking row created with paidCents=3000 in a single atomic transaction
  → redirect to confirmed page
```

Pros: no orphan bookings, simple refund logic, simple "did they pay" check (`paidCents === 3000`).
Cons: bigger UI change, need to manage the "Pay" button as a separate state from "Book" button.

### Option B — Deposit AFTER booking is created

```
Customer fills form → clicks Book
  → onSubmit runs createBooking as today
  → booking created with status='PENDING_PAYMENT', paidCents=0
  → card form revealed
  → customer pays
  → webhook fires payment_intent.succeeded
  → server updates booking: status='CONFIRMED', paidCents=3000
  → redirect to confirmed page
```

Pros: smaller UI delta, reuses existing createBooking logic, the existing webhook handles confirmation.
Cons: orphan bookings if customer abandons after step 1, need a PENDING_PAYMENT status everywhere that looks at booking status (calendar, staff portal, etc.), need a cleanup job for stale pending bookings.

**Mick's choice: ____**

(My recommendation is Option A — clean atomic flow, no PENDING_PAYMENT state to manage.)

---

## What already exists in the codebase (don't rebuild)

| Component | Path | Status |
|---|---|---|
| `stripe` npm package | package.json | ✅ Installed (`^22.1.0`) |
| `@stripe/stripe-js` | package.json | ✅ Installed (`^9.3.1`) |
| `@stripe/react-stripe-js` | package.json | ✅ Installed (`^4.0.0`, added in commit 1) |
| Lazy-loaded Stripe singleton | `lib/stripe.ts` | ✅ `getStripe()`, `stripeEnabled()`, `depositCents()`, `depositsEnabled()` |
| Webhook handler with signature verify | `app/api/stripe/webhook/route.ts` | ✅ Handles `payment_intent.succeeded` |
| Deposit endpoint (creates PaymentIntent) | `app/api/bookings/[id]/deposit/route.ts` | ✅ POST returns `clientSecret` |
| Booking.paymentIntentId field | `prisma/schema.prisma` | ✅ Already in schema, no migration needed |
| Booking.paidCents field | `prisma/schema.prisma` | ✅ Already in schema |
| Booking.cancellationFeeCents field | `prisma/schema.prisma` | ✅ Already in schema |

---

## Env vars needed in Vercel before this can go live

Add these in order:

| Variable | Value | Sensitivity | Where Mick gets it |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` (test mode first), then `sk_live_...` later | **HIGH** — never paste into chat. Paste directly into Vercel env var dialog. | Stripe dashboard → Developers → API keys → reveal secret key |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_51TW3R6DOFXqzUzyrJtZibM50o6tBIXMgVDP84TqiOu4k21OaFLCq5akHHomNAc6XtKZ4fcvRkj6jhXjcTXzF59Mh00qp94tVHP` | Low (designed to be browser-visible) | Stripe dashboard (test publishable key, already captured during planning) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Same value as `STRIPE_PUBLISHABLE_KEY` | Low | Needs the `NEXT_PUBLIC_` prefix so Next.js exposes it to the browser bundle |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | **HIGH** — paste into Vercel directly | Created in Stripe → Developers → Webhooks → Add endpoint (after Commit 3+4 are deployed and the endpoint URL exists) |
| `DEPOSIT_CENTS` | `3000` | Low | Constant — for $30. Optional (defaults to 3000 in code anyway) |
| `NEXT_PUBLIC_DEPOSITS_ENABLED` | `false` initially → `true` only when ready to go live | Low | The kill switch. While unset or anything other than `"true"`, the deposit UI stays hidden and customers see the current flow. |

## Webhook setup (post-deploy step)

After Commit 3 and 4 are deployed:

1. Sign in to https://dashboard.stripe.com (test mode for first round)
2. Developers → Webhooks → Add endpoint
3. URL: `https://www.manlyremedialthai.com.au/api/stripe/webhook`
4. Events to send: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
5. Copy the signing secret (`whsec_...`)
6. Paste it into Vercel as `STRIPE_WEBHOOK_SECRET`
7. Redeploy
8. Test with a test card

---

## Go-live checklist (final session)

Don't flip live keys until ALL of these pass in test mode:

- [ ] Test mode: complete a booking with card `4242 4242 4242 4242`, expiry `12/34`, CVC `123`. Booking appears in DB with `paidCents=3000` and `paymentIntentId` set.
- [ ] Test mode: complete a booking with card `4000 0000 0000 0002` (Stripe's "card declined" test card). Booking should NOT be created, customer sees a clear error message.
- [ ] Test mode: book then cancel with 2+ hours notice → verify refund issued in Stripe dashboard.
- [ ] Test mode: book then cancel inside 1 hour window → verify NO refund issued, booking marked cancelled with fee retained.
- [ ] Test mode: book, then close browser before completing payment → verify no orphan booking left in DB (or, if Option B, that cleanup job clears it).
- [ ] Webhook event log in Stripe dashboard shows `payment_intent.succeeded` delivered successfully (200 response).
- [ ] Staff booking notification email still fires correctly on each booking.
- [ ] Customer confirmation email still arrives.

Only when all green:

1. Generate live Stripe keys (`sk_live_...` and `pk_live_...`)
2. Swap test → live keys in Vercel env vars
3. Update webhook endpoint in Stripe to live mode (or create a new one in live mode pointing to the same URL)
4. Update `STRIPE_WEBHOOK_SECRET` with the live-mode webhook signing secret
5. Redeploy
6. Make one real booking with Mick's own card to verify
7. Refund it manually via Stripe dashboard
8. Open for real customers

---

## Risk register

- **Risk:** Schema push runs on every deploy (`prisma db push --skip-generate` in build script). If a future commit adds a field that conflicts with existing data, it could fail mid-deploy and lock the schema. **Mitigation:** the deposit feature uses fields that ALREADY exist in the Booking model (`paymentIntentId`, `paidCents`) — no new schema fields are needed.
- **Risk:** Customer abandons mid-payment, orphan bookings accumulate. **Mitigation:** Option A architecture eliminates this entirely. If Option B is chosen, add a daily cron job to clean up bookings older than 30 minutes still in PENDING_PAYMENT status.
- **Risk:** Webhook signature verification could be bypassed if someone discovers the URL. **Mitigation:** `STRIPE_WEBHOOK_SECRET` is required by the existing webhook handler; without it, all incoming requests are rejected. Never share the secret.
- **Risk:** Live keys accidentally committed to repo. **Mitigation:** all keys live in Vercel env vars, never in code or markdown. This plan document references only the test-mode publishable key (which is safe to share).
- **Risk:** Stripe rate limit or downtime during a booking. **Mitigation:** the deposit endpoint should fail gracefully with a clear customer message; the booking flow falls back to pay-at-clinic if deposits are unavailable.

---

## Resume instructions

When picking this back up:

1. Read this whole document.
2. Have Mick decide Option A vs Option B.
3. Verify the two shipped commits (1 and 2) are still in master.
4. Open `app/(public)/book/confirm/confirm-form.tsx` and study the existing `onSubmit` and form rendering carefully before adding card UI.
5. Commit 3 should be one focused, well-tested commit — don't try to combine with Commit 4 or 5.
6. After each commit, watch the Vercel build go green before moving to the next.
7. Don't flip `NEXT_PUBLIC_DEPOSITS_ENABLED` to true until Commit 5 is shipped and webhook is configured.
