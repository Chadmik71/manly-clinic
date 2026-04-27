# Manly Remedial Clinic — booking platform

Full-stack booking platform for a remedial-therapy clinic. Built with Next.js 15
(App Router), Prisma, NextAuth, Tailwind, and shadcn-style primitives.

## Features

**Public site** (clinic-style design, light + dark mode, mobile-first)
- Home, Services & pricing, About, Contact, Privacy policy, Terms

**Booking flow**
- Pick service → duration → date → time slot → confirm
- Health intake form + explicit consent capture (Privacy Act 1988 compliant)
- Auto-assigns an available therapist for the chosen time

**Client portal** (`/portal`)
- Upcoming + past bookings, cancel
- Health intake history (latest snapshot + previous submissions)
- Consent history
- Self-service data export (download all your data as JSON)

**Staff dashboard** (`/staff`, role-gated)
- Today's stats and schedule
- Per-therapist daily schedule, two-week navigation
- All bookings: search by reference / client name / email + status filter
- Booking detail with status updates and audited access to health info
- Clients list + per-client profile (booking history + intake)
- Therapists list with weekly availability
- Services list (read-only, edit via seed file or Prisma Studio)

**Australian compliance scaffolding**
- Encrypted database storage (use Postgres in `ap-southeast-2` for prod)
- Audit logging for all health-info access (`AuditLog` table)
- Consent records timestamped with IP + user-agent (`ConsentRecord`)
- Data residency: Postgres connection string controls region — see `.env.example`
- Privacy policy aligned with the Australian Privacy Principles
- Self-service access / export / deletion request flows
- Notifiable Data Breaches readiness via the audit trail

> ⚠️ This codebase implements reasonable practices. Real legal compliance for a
> healthcare practice still needs review by a privacy lawyer or consultant
> before going live with real client data.

## Stack

- **Framework**: Next.js 15 (App Router, Server Actions)
- **Auth**: NextAuth v5 (credentials provider, JWT sessions)
- **DB**: Prisma + SQLite for dev (swap to Postgres for prod)
- **UI**: Tailwind CSS, Radix primitives, lucide-react, next-themes (dark mode)

## Getting started

```bash
# 1. Install
npm install

# 2. Initialise the database & seed
npm run db:push
npm run db:seed

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Seeded accounts

| Role   | Email                     | Password    |
| ------ | ------------------------- | ----------- |
| Admin  | admin@clinic.local        | admin123    |
| Staff  | therapist@clinic.local    | staff123    |
| Client | client@example.com        | client123   |

Change these immediately for any non-local environment.

## Configuration

Copy `.env.example` to `.env` and adjust:

- `DATABASE_URL` — keep SQLite for dev, switch to a Postgres connection string
  in **`ap-southeast-2` (Sydney)** for production to satisfy data-residency
  expectations under the Privacy Act.
- `AUTH_SECRET` — long random string (`openssl rand -base64 32`).
- `AUTH_URL` — public URL of your deployment.

### Switching to Postgres

1. Update `DATABASE_URL` in `.env`.
2. In `prisma/schema.prisma`, change `provider = "sqlite"` to
   `provider = "postgresql"`.
3. Run `npx prisma migrate dev --name init`.

## Project layout

```
app/
  (public)/         # marketing site, services, contact, privacy, /book
  (auth)/           # /login, /signup
  (portal)/
    portal/         # client portal
    staff/          # staff/admin dashboard (role-gated by middleware)
  api/
    auth/[...]      # NextAuth handler
    signup          # account creation
    portal/export   # GDPR/APP-style data export
components/
  ui/               # shadcn-style primitives
  site-header.tsx   # public nav
  site-footer.tsx   # public footer
  portal-shell.tsx  # shared shell for /portal and /staff
  theme-provider.tsx
  theme-toggle.tsx
lib/
  auth.ts           # NextAuth config
  db.ts             # Prisma client singleton
  audit.ts          # write to AuditLog
  booking.ts        # availability / slot calculation
  utils.ts          # cn(), formatPrice(), etc.
  clinic.ts         # single source of truth for clinic info
prisma/
  schema.prisma
  seed.ts
```

## What's stubbed (TODO before launch)

- Stripe / payment integration (currently "pay in clinic")
- Booking reminders via SMS / email (Resend is in `.env.example` but not wired)
- HICAPS / health-fund claim integration
- Drag-to-reschedule calendar UI (current schedule is read-only list view)
- Edit availability + time-off UI for therapists (data model exists)
- Edit services UI (data model exists; today edit via seed or Prisma Studio)
- 2FA for staff accounts
- Production logging / monitoring (Sentry, etc.)
