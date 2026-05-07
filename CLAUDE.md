# Manly Remedial & Thai Massage — Clinic Management







Next.js clinic management app for Manly Remedial & Thai Massage, Sydney AU.



Single owner-operator (Mick). Production handles real patient data.







## Stack







- **Framework**: Next.js 14 (App Router, RSC)



- **DB**: Prisma 6+ → PostgreSQL (Vercel Postgres in prod)



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



- `components/body-diagram.tsx` — front+back SVG silhouette, 38 zones, exports `BodyDiagram` + `zoneLabel`



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







## Testing







- No CI. Manual smoke after each release-y push.



- Local dev: `npm run dev` with separate dev DB in `.env.local`.







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





