# Fix / Change Log — Manly Remedial & Thai Massage (manly-clinic)

A running record of everything asked of Claude to fix, add, or investigate in
this repo — so it's easy to recognize "have I already asked for this?" or
"was this already fixed?", and to see at a glance what's still waiting on
real-world confirmation, without digging back through chat history.

**Convention:** one row per request. Add a new row whenever a fix/change is
completed — don't edit old rows except to update **Status**/**Follow-up** if
something changes (a regression, or a pending confirmation coming back
positive/negative). Use **Follow-up** for anything shipped but not yet
provably confirmed in the real app — put "—" if the fix was confirmed
immediately or needs no further check. Once a follow-up resolves, update the
cell in place and drop it from the Open follow-ups list below.

## 🔭 Open follow-ups

Anything below with an unresolved **Follow-up** cell — check these first when
starting a session, since they're the "did this actually work?" items still
waiting on evidence.

- **Health-data encryption (2026-09-29):** `FIELD_ENCRYPTION_KEY` is set for Production only; tick Preview too if preview deploys are ever used (they share the prod DB). Test logins `therapist@clinic.local` and `smoke-staff@manlyremedialthai.com.au` exist on prod with known passwords: remove or change them (Mick to decide).

## Backlog — found during QA, not yet actioned

Surfaced by the 2026-08-11 deep-testing pass, not yet requested as a fix:

- Couple-booking confirmation screen (`/portal/bookings/confirmed`) only shows the primary service/price, not the partner half or the combined total (both bookings ARE created correctly — display-only).
- Walk-in voucher form (`/staff/vouchers/new`) requires a recipient email even though its own copy says "print it and hand it over" is an option.
- CLAUDE.md says every customer booking captures a fresh signature; code (by design) only requires one for pregnancy/health-fund bookings — doc drift.
- `/portal/bookings/[id]/reschedule` moves the booking on a single click with no "confirm this move?" step.

| Date | Asked | Issue found | Result / fix | Status | Follow-up | Ref |
|---|---|---|---|---|---|---|
| 2026-08-11 | Staff calendar (`/staff/schedule`) only lets you step one day at a time via the ‹ › arrows; asked for a way to jump straight to a date (e.g. 15 days out) | N/A — feature request | Added a clickable date label next to the clock icon in `DateNav` that opens the browser's native date picker; picking a date navigates straight to `?date=...`. Verified working locally and live on production. | ✅ Done | — | `components/staff-shell.tsx`, commit `a2d5b6a` |
| 2026-08-11 | Use Fable 5 to deep-test the site — customer view, staff view, audit view — assuming the site is live even under maintenance mode | N/A — testing/investigation request | Ran 3 parallel Fable 5 QA agents: deep functional testing (real submissions, synthetic data) against local dev, plus a read-only pass against production with maintenance-mode bypass via the existing staff-session/preview-token mechanism. Surfaced 6 real bugs (rows below) plus 4 lower-priority backlog items (see Backlog section above). | ✅ Done | — | 3 agent runs (customer-facing, staff portal, audit-logging) |
| 2026-08-11 | Fix the audit-logging gap found during testing | `/staff/bookings/[id]` only wrote a `VIEW_HEALTH_INFO` audit entry when the client had an `IntakeForm` on file — a booking for a client with no intake at all (clinical notes, annotations, contact details all visible) left zero audit trail | Logging now happens unconditionally; `resource` points at the `Booking` itself (not the client's possibly-unrelated latest intake), with the intake id carried in metadata instead | ✅ Done | — | `app/(portal)/staff/bookings/[id]/page.tsx`, commit `048d8fe` |
| 2026-08-11 | (same batch) fix the literal `·` text bug found on the clinical notes form | In an uncommitted in-progress feature (chip-based SOAP note builder), `·` was sitting as raw JSX text outside any JS string, so it rendered the literal 6 characters instead of a "·" separator | Wrapped in `{"·"}` so the escape is interpreted at runtime | ✅ Done | — | `app/(portal)/staff/bookings/[id]/clinical-notes-form.tsx`, commit `ff76db9` |
| 2026-08-11 | (same batch) fix the Block Time dialog defaulting to the wrong day | `date` state was seeded once via `useState(dateStr)` at mount and only resynced on dialog close; navigating to a different day (via arrows or the new date-picker) then opening the dialog silently kept the originally-loaded day | Added `openDialog()` that resyncs `date` to the currently-viewed `dateStr` every time the dialog is opened | ✅ Done | — | `app/(portal)/staff/schedule/block-time-dialog.tsx`, commit `36e07fd` |
| 2026-08-11 | Fix the couple-booking race (HIGH) — ticking "booking for two" then clicking quickly could silently produce a solo booking | Two compounding bugs: (1) the date-tab links in `page.tsx` never included `&partner=` at all, unconditionally — not just a timing issue; (2) both date tabs and slot links were built from server-rendered props that lag behind the URL for a moment right after the couple checkbox's `router.push` | Extracted date tabs into a new `date-tabs.tsx` client component reading `partner` live from `useSearchParams()`; `slot-picker.tsx` now also prefers the live URL value over the (possibly stale) prop | ✅ Done | — | `app/(public)/book/date-tabs.tsx` (new), `app/(public)/book/page.tsx`, `app/(public)/book/slot-picker.tsx`, commit `9f8eade` |
| 2026-08-11 | Fix the therapist real-name fallback | `therapistPublicName()` fell back to the therapist's real name whenever `displayName` was unset. The "Add Therapist" form never collects a display name, so this wasn't a rare edge case — it's the default state for every newly added therapist until an admin manually sets one | Fallback changed to a safe `Staff <ID>` placeholder instead of the real name; added optional `id` to `TherapistNameish`; corrected the stale `schema.prisma` comment that had documented the old (unsafe) behaviour as intentional | ✅ Done | — | `lib/utils.ts`, `prisma/schema.prisma` (comment only), commit `c5194e6` |
| 2026-08-11 | Fix the submit-time session mismatch | `createBooking()` re-read `auth()` fresh at submit time with no check against the session shown on page load ("Booked under X"). If a different account signed in on another browser tab before submit, the booking and health intake silently saved under the new account with no warning. A `_signedInEmail` hidden field already existed on the form but was never actually validated server-side | `createBooking` now compares `_signedInEmail` (captured at page load) against the current session's email at submit, and rejects with a clear message on mismatch. The legitimate "Not you?" sign-out flow is unaffected since it does a full page reload | ✅ Done | — | `app/(public)/book/confirm/actions.ts`, commit `90c4da3` |
| 2026-09-29 | Scramble the sensitive health data (Andrew Wallis's security review, point 5: encrypt personal data a second time inside the tables) | Medical history, clinical notes, signatures, GP details and fund member numbers were plain-text columns, protected only by Neon's disk encryption: anyone with the DB password or a backup could read them | New `lib/field-crypto.ts` (AES-256-GCM, `enc1:` prefix, key in `FIELD_ENCRYPTION_KEY`), wired into the Prisma client in `lib/db.ts` so writes are encrypted and reads decrypted everywhere, including nested includes and transactions. 27 columns across IntakeForm, User and Booking. No schema change. Client search no longer matches fund member numbers (they can't be searched once encrypted). Backfill/rollback script `scripts/encrypt-health-fields.ts`. Verified on the dev DB: 6 unit tests, raw rows encrypted and app reads plain, staff client/intake/record/booking pages show no `enc1:`, claim invoices still embed the signature, smoke 56/56 | ✅ Done: live 2026-09-29 (commit 244138f, deployed with the 8 unpushed 2026-08-11 fixes). Prod backfill: 4 rows / 17 values, re-check 0 left. Mick confirmed a live intake-history page reads normally | ⏳ Tick Preview on the key (see Open follow-ups) | `lib/field-crypto.ts`, `lib/db.ts`, `scripts/encrypt-health-fields.ts`, `.env.example`, `app/(portal)/staff/clients/page.tsx`, `app/(portal)/staff/bookings/new/actions.ts` |
