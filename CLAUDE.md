# Manly Remedial & Thai Massage — Clinic Management







Next.js clinic management app for Manly Remedial & Thai Massage, Sydney AU.



Single owner-operator (Mick). Production handles real patient data.







## Stack







- **Framework**: Next.js 16 (App Router, RSC)



- **DB**: Prisma 5.22 → PostgreSQL (Neon Postgres in prod)



- **Auth**: NextAuth (JWT sessions)



- **Email**: Resend (via `lib/notify.ts`)



- **SMS**: Twilio



- **PDF**: pdfkit (`lib/invoice.ts`)



- **Hosting**: Vercel — auto-deploys on every push to `master`







## Repo conventions







- Single branch: `master`. Push directly; Vercel deploys.



- Conventional commits with scopes: `feat(book): …`, `feat(invoice): …`, `fix(staff): …`



- Server actions live next to the page that uses them (`app/.../actions.ts`)



- Every staff data-view is audit-logged via `lib/audit.ts`



- All times stored as UTC; display + day-of-week logic via `lib/time.ts`



- Run `npm run build` locally before any non-trivial push







## Key files







- `prisma/schema.prisma` — single source of truth for the data model



- `lib/time.ts` — `sydneyDow`, `sydneyDateOf`, `sydneyDayBoundsUtc`, `sydneyLocalToUtc`, `sydneyTimeShort`



- `lib/booking.ts` — slot calculation; `getDistinctSlotTimes` counts distinct `therapistId`s via `Set`



- `lib/notify.ts` — Resend email + Twilio SMS; couple-aware `notifyBookingConfirmed`



- `lib/invoice.ts` — invoice PDF; embeds signature when `signatureDataUrl` is passed



- `lib/intake.ts` — `parseHistory`, `historyLabel`, `MEDICAL_HISTORY_GROUPS`



- `lib/audit.ts` — append-only audit log; required on every staff data view



- `components/body-diagram.tsx` — front+back SVG silhouette client component (exports `BodyDiagram`)
- `lib/body-diagram-zones.ts` — zone definitions + `zoneLabel` lookup; safe for server components to import (the body-diagram itself is `"use client"`)



- `components/signature-pad.tsx` — HiCAPS signature canvas (HiDPI, 600×180)



- `components/annotated-diagram-pad.tsx` — staff free-form annotation pad over silhouette



- `app/(public)/book/…` — customer booking flow (multi-step, server actions)



- `app/(portal)/staff/…` — staff portal (bookings, clients, intake history)



- `app/api/bookings/[id]/invoice/route.ts` — invoice PDF endpoint







## Domain rules







- **Hours**: last bookable slot 20:00 (30-min cleanup buffer enforced)



- **Couples**: two distinct therapists required; persisted as two `Booking` rows linked by `${reference}` (primary) and `${reference}-P` (partner). Partner name is required.



- **HiCAPS**: customers claiming health-fund rebate must sign at booking. Signature persists on `IntakeForm.signatureDataUrl`, renders on invoice PDF.



- **Pre-fill**: returning customers see their last intake pre-filled, including body-diagram zones (`painLocationCodes`).



- **DB transfers**: patient data is real and protected. Use `scp`, never git.



- **Compliance**: Australian Privacy Act applies — patient health data.







## Recent work (May 2026)







Couple-booking flow, signature capture, body-diagram intake, per-client intake history page, staff annotation drawing on body diagram. Three new optional columns added to `schema.prisma`:



- `IntakeForm.signatureDataUrl`



- `IntakeForm.painLocationCodes`



- `Booking.noteAnnotationsPng`







## ⚠️ Pending action — REQUIRED before next customer booking







The three columns above are in `schema.prisma` but **not yet pushed to production Postgres**. Until pushed, every booking submit returns 500 (Prisma "column does not exist") because `IntakeForm.create` and `Booking.update` now reference columns the DB doesn't have.







```bash



DATABASE_URL="<prod connection string>" npx prisma db push



```







Grab the prod `DATABASE_URL` from Vercel → Project → Settings → Environment Variables.







After pushing, smoke-test against prod:



- Couple booking creates two `Booking` rows (primary + `-P`)



- Confirmation email lists both services



- Signature renders on the invoice PDF



- Body-diagram zones save and pre-fill on the next visit







## Gotchas







- **`Date.getDay()` runs in server's local TZ** (UTC on Vercel). Always use `sydneyDow(sydneyDateOf(date))` for day-of-week logic — not raw `getDay()`. Bug previously assigned early-morning Sydney slots to the wrong weekday.



- **pdfkit `doc.image()` wants `Buffer`, not data URL** — see `dataUrlToPngBuffer` in `lib/invoice.ts`.



- **`getDistinctSlotTimes` uses a `Set` of `therapistId`s** — overlapping availability rows would otherwise over-report slot capacity. Don't "simplify" this.



- **`findUnique` without `select` includes everything** — fine on staff pages, careful on customer endpoints.



- **Schema changes**: after `prisma db push`, force-redeploy on Vercel if the next deploy doesn't pick up the new client.



- **`next-themes` script-tag warning** is a known React 19 vs next-themes 0.4.x compat gap. Dev-only console noise; non-fatal. `<html suppressHydrationWarning>` already handles the actual hydration mismatch — don't chase the warning until next-themes ships a fix.



- **Auth middleware lives in `proxy.ts`** (renamed for Next.js 16 — the file convention used to be `middleware.ts`).







## Testing







- No CI. Manual smoke after each release-y push.

- `npm run smoke` hits ~50 routes/endpoints against a running server (default `http://localhost:3000`; override with `SMOKE_URL=...`). Run after `npm run build`, before `git push`. Catches the kind of "page renders fine in dev but 500s on first request" bug that bit the staff intake viewer.

- Local dev: `npm run dev` with separate dev DB in `.env`. Prisma CLI auto-loads `.env`, not `.env.local`.







## Out of scope for this repo







Zeed Badminton Club Internal League 2026 (separate project — HTML dashboard + xlsx workbook). If a request mentions "Zeed", "badminton", or "league", confirm before assuming it belongs here.







## Git workflow







This is a solo repo with direct-to-master pushes and Vercel auto-deploy. The workflow assumes you (Claude Code) are doing the git operations on my behalf.







### Default flow for any change







1. Make the edits



2. Run `npm run build` — **never push if the build fails**. Surface the error and let me decide.



3. `git add` only the files you actually changed (don't `git add .` blindly)



4. Show me the proposed commit message before committing



5. `git commit` with a conventional-commit message



6. `git push origin master` — Vercel auto-deploys







### Commit message conventions







- Format: `type(scope): short imperative summary`



- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`



- Common scopes: `book`, `invoice`, `staff`, `booking`, `intake`, `components`, `auth`, `notify`



- Body (optional, separated by blank line) explains *why* if not obvious from the diff



- Never mention "Claude" or "AI" in commit messages — keep them human-readable







Examples that match the existing history:



- `feat(book): require partner name on couple bookings`



- `feat(invoice): embed patient signature on PDF for HICAPS audit`



- `fix(staff): use Sydney dow when computing slot day-of-week`







### Schema changes







When `prisma/schema.prisma` changes:







1. Commit and push the schema change first



2. **Remind me to run** `DATABASE_URL="<prod url>" npx prisma db push` against production before the next user action that touches the new column



3. Don't run `prisma db push` against prod yourself — the prod connection string isn't in `.env.local`, and it shouldn't be







For dev, `npx prisma db push` against the local DB is fine to run unattended.







### Pre-push safety checks







Always run these before pushing, in order. Bail on the first failure:







```bash



npm run build              # catches type errors + missing imports



npx prisma validate        # only if schema.prisma changed



```







If the build fails, fix it or revert the change — don't push and "fix in a follow-up." Vercel deploys on every push and broken master = broken booking page = lost revenue.







### Hard rules







- **Never force-push** master (`git push -f`, `git push --force-with-lease`)



- **Never rebase** master — only fast-forward merges



- **Never commit** `.env`, `.env.local`, `*.db`, `*.sqlite`, `prisma/dev.db`, or anything in `uploads/`



- **Never commit** patient data, real names, real phone numbers, real fund member numbers — even in tests or seed scripts. Use synthetic data.



- **Never commit** the prod `DATABASE_URL` or any Vercel env value



- If a `git status` shows unexpected changes (files I didn't ask you to touch), stop and ask before committing







### When to ask before pushing







Default: ask before every push during the first week. After that, you can push without asking when *all* of these are true:



- Single-file change, < 50 lines



- `npm run build` passes



- No schema changes



- No changes to auth, payments, or notify







For anything else (multi-file refactors, new server actions, schema changes, anything customer-facing), show me the diff and the commit message and wait for "yes."







### Branches & PRs







Solo repo, no PRs needed for routine work. But:



- For experiments you're not sure about, create a branch (`git checkout -b experiment/feature-name`) and push that instead of master



- Use `gh pr create` if a change deserves a written rationale or might need to be reverted cleanly later



- Don't open PRs for trivial changes — that just adds friction





## Lessons (2026-05-13)



### JSX `$` adjacent to `{` bug



Writing template-literal syntax (`${...}`) in JSX text or attribute values is a parse hazard — JSX wants `{expr}`, not `${expr}`. Even valid-looking forms like `"$" + {value}` or `<span>$$ {amount}</span>` have bitten us once the surrounding code includes a real `{` for a JSX expression.



**Fix pattern**: pre-compute the display string in a `const` outside the JSX, then interpolate the variable on its own. See `app/(portal)/staff/settings/settings-form.tsx:51-55` — `pctStr` is computed in an IIFE above the return statement, and the JSX just renders `{pctStr}`. The inline comment in that file calls this out explicitly: *"Pre-compute display string outside JSX to keep the JSX free of $ adjacent to { problems."*



Rule of thumb: any `$` next to `{` inside JSX is suspicious. Move the formatting to a variable.



### StaffShell wrapper pattern



`components/staff-shell.tsx` is the sidebar-rail shell for the staff portal. It is a **client component** (`"use client"`) because it uses `usePathname` for active-route highlighting and the next-auth client `signOut`. The staff route group's `layout.tsx` stays a **server** component so it can `await auth()` and redirect non-staff users.



The shell is therefore **wrapped per-page, not in the layout**:



```tsx
// app/(portal)/staff/settings/page.tsx — canonical pattern
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/staff/settings");
  const settings = await getClinicSettings();
  return (
    <StaffShell user={session.user}>
      <div className="p-4 space-y-6 max-w-2xl">...</div>
    </StaffShell>
  );
}
```



**Why per-page, not in `layout.tsx`**: putting `StaffShell` in the layout would force the entire staff subtree across the client boundary, breaking RSC data fetching in nested pages. Per-page wrapping also lets each page pass its own `topbar` slot.



**The bug that motivated this section**: the settings page initially shipped without the wrap and rendered as a bare form with no sidebar. Fixed in `7717454 fix(staff/settings): wrap page in StaffShell so the sidebar renders`. **When adding a new staff page, always wrap in `<StaffShell user={session.user}>…</StaffShell>` — there is no layout fallback.**



### Clinic settings (runtime feature flags)



Runtime-editable settings for things we previously hard-coded. Lives at:



- `lib/clinic-settings.ts` — `getClinicSettings()` (lazy-upserts a singleton row at `id: "default"`) and `getClinicSettingsSafe()` (same, but falls back to `CLINIC_SETTINGS_DEFAULTS` on DB error). Also exports `computeCardSurchargeCents(baseCents, settings)`.
- `app/(portal)/staff/settings/{page,settings-form,actions}.tsx` — admin UI, wrapped in `StaffShell`, marked `dynamic = "force-dynamic"`.
- `prisma/schema.prisma` — `ClinicSetting` model, singleton pattern.



Current fields: `depositsEnabled`, `cardSurchargeEnabled`, `cardSurchargeBps` (basis points, hard-capped at 500 = 5%).



**Important call-site choice**:



- Payment-critical paths (e.g. `/api/bookings/payment-intent`) call `getClinicSettings()` — DB failure should propagate, never silently fall back to defaults that could charge the wrong amount.
- Display-only paths (deposit-card UI surcharge preview) call `getClinicSettingsSafe()` — better to render with defaults than blank-page.



Surcharge appears as an **itemised line** on the customer confirm page for ACCC disclosure (`feat(deposit-card): show itemised surcharge breakdown for ACCC disclosure`). Don't bury it in the total.



### Rate-limit module



`lib/rate-limit.ts` — fixed-window, in-memory limiter for public API routes. Surface area:



- `getClientIp(req)` — reads `x-forwarded-for` (first entry), falls back to `x-real-ip`, then `"unknown"`.
- `rateLimit(key, limit, windowMs)` — returns `{ allowed, remaining, resetAt, retryAfterSec }`.
- `rateLimitResponse(result)` — 429 JSON with `Retry-After` header.
- `RATE_LIMITS` presets: `paymentIntent` 10/min, `depositRefund` 20/min, `signup` 5/min.



Wired into: `app/api/signup/route.ts`, `app/api/bookings/payment-intent/route.ts`, `app/api/bookings/[id]/deposit/route.ts`. All key on `"<route>:<ip>"`.



**Caveats**:



- **Per-instance, not global**. Vercel runs multiple lambda instances; a warm instance counts repeat callers but a cold start resets the Map. Treat the limit as casual-abuse deterrent (card-testing, signup spam, retry loops), **not a DDoS or security boundary** — for that, pair with Vercel WAF or move to Upstash Redis. The file's header comment says this explicitly; don't rip it out.
- **Self-prunes on read** (`pruneIfNeeded`, at most once per minute) — no background job needed, memory stays bounded.
- **Variable-shadow gotcha**: in `/api/signup` the rate-limit `ip` collided with the audit-log `ip` and silently broke audit logging. Fixed in `bd4f61d fix(api/signup): rename rate-limit ip var to avoid shadowing audit ip`. When adding the limiter to a new route that also calls `audit.log({ ip })`, rename one of them (e.g. `clientIp`).





