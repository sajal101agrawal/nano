# Nano

Nano is a full-stack staff augmentation talent platform. It combines a public-facing candidate job board with a private admin dashboard, a vendor (staffing company) portal, an AI-powered CV parsing and matching pipeline, automated availability tracking, draft application recovery, and multi-stream email outreach — backed by PostgreSQL with pgvector, Redis/BullMQ, and Anthropic Claude.

---

## What it does

**For candidates (public)**
- Browse open roles at `/jobs` and apply via a multi-step wizard: CV upload, contact details, work preferences, and custom screening questions
- Resume incomplete applications via saved draft links
- Confirm availability with one-click email links
- Unsubscribe from outreach emails

**For staffing companies / vendors (portal)**
- Register at `/staffing/register` using a company email (personal email providers blocked)
- Email OTP-based auth — no passwords required
- Company autocomplete during registration builds a shared company database
- Upload CVs in bulk (up to 50 PDF/DOCX files at once) — AI parses and indexes them automatically
- Import resources via CSV template
- Manage resource availability (available / unavailable / unknown) per person
- Edit resource details, notes, rates, and notice periods
- View their resource pool with search and availability filters

**For recruiters (admin)**
- Manage candidates, requirements, clients, and applications from `/admin`
- Review AI-ranked matches with scores and rationale for every open role
- Send templated outreach emails with delivery tracking
- Source external prospects via Apollo.io search and enrichment
- Export client-ready redacted CVs with agency branding
- Monitor analytics, notifications, and incomplete drafts
- **Staffing section** at `/admin/staffing`:
  - View all vendor companies, users, and their resource pools
  - Verify/unverify companies, edit or delete companies and users
  - Search and filter the full resource pool across all companies
  - Send email to individual users, specific users, or all users of a company — with staffing-specific templates and optional JD attachment

**Under the hood**
- CVs parsed by Claude (`tool_use` for structured output) with OpenAI embeddings for semantic search
- HNSW vector similarity + rule-based scoring + Claude re-ranking for candidate matching
- BullMQ background worker for CV parsing, matching, email, availability checks, and draft reminders
- Resend for transactional, outreach, and availability email streams

---

## Architecture

```
Browser
   │
   ▼
Next.js App (port 3000)          BullMQ Worker
   ├─ /jobs (public)                  ├─ cv-parse (candidates + staffing resources)
   ├─ /staffing (vendor portal)        ├─ match
   ├─ /admin (JWT-gated)              ├─ email
   └─ /api/* (REST)                   ├─ availability
        │         │                   └─ draft-reminder
        ▼         ▼
      Redis   PostgreSQL + pgvector
                  │
              S3 / MinIO (CVs)
```

Two long-running processes share PostgreSQL and Redis. In production Docker/Railway, both run in a single container via `scripts/start.sh`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 18, TypeScript 5 |
| Database | PostgreSQL 16 + pgvector + pg_trgm |
| Queue / Cache | Redis 7 + BullMQ 5 |
| File Storage | S3-compatible (MinIO local, Cloudflare R2 / AWS S3 prod) |
| AI — Parsing & Ranking | Anthropic Claude (claude-sonnet-4-5) |
| AI — Embeddings | OpenAI text-embedding-3-small (1536-dim) |
| Email | Resend |
| SMS (optional) | Twilio |
| Sourcing (optional) | Apollo.io |
| Auth | JWT (jose), Argon2, TOTP 2FA (admin), Email OTP (candidates + vendors) |
| UI | Tailwind CSS 3, Radix UI, Lucide icons |

---

## Quick start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose

### Setup

```bash
git clone <repo-url>
cd nano
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, RESEND_API_KEY, SESSION_SECRET, APP_SECRET
./start.sh
```

Access:
- App / Job board: http://localhost:3000
- Admin: http://localhost:3000/admin (credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`)
- Vendor portal: http://localhost:3000/staffing
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

For manual setup, port configuration, and production deployment, see [docs/setup.md](docs/setup.md).

---

## Scripts

| Command | Description |
|---|---|
| `./start.sh` | One-command dev start (infra + migrate + seed + app + worker) |
| `./start.sh prod` | Production mode locally |
| `npm run dev` | Next.js dev server |
| `npm run dev:worker` | Worker with hot reload |
| `npm run dev:all` | Both app and worker |
| `npm run build` | Production build |
| `npm run worker` | Production worker |
| `npm run db:migrate` | Run SQL migrations |
| `npm run db:seed` | Seed admin account |
| `npm run test` | Jest tests |
| `npm run type-check` | TypeScript check |

---

## Documentation

Full documentation is in the [docs/](docs/) folder:

| Document | Topics |
|---|---|
| [docs/README.md](docs/README.md) | Documentation index and platform overview |
| [Features](docs/features.md) | All platform features and capabilities |
| [Architecture](docs/architecture.md) | System design, auth, queues, data flows, security |
| [Application Flows](docs/flows.md) | Candidate apply, admin workflows, email, availability |
| [Admin Dashboard](docs/admin-dashboard.md) | Admin UI sections and recruiter actions |
| [API Reference](docs/api.md) | All REST endpoints |
| [Database Schema](docs/database.md) | Tables, indexes, relationships |
| [AI & Matching](docs/ai-matching.md) | CV parsing, embeddings, matching algorithm |
| [Worker & Queues](docs/worker.md) | BullMQ processors and cron jobs |
| [Integrations](docs/integrations.md) | Claude, OpenAI, Resend, Apollo, S3, Twilio |
| [Setup Guide](docs/setup.md) | Local dev, Docker, production |
| [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) | Railway deployment guide |

---

## Project structure

```
nano/
├── src/
│   ├── app/
│   │   ├── admin/              # Admin dashboard (auth + protected pages + staffing section)
│   │   ├── staffing/           # Vendor portal (auth + portal pages)
│   │   ├── api/                # REST API (admin + candidate + staffing)
│   │   ├── jobs/               # Public job board + application wizard
│   │   ├── availability/       # Availability confirmation
│   │   └── unsubscribe/        # Email unsubscribe
│   ├── components/             # UI, admin, and staffing components
│   ├── lib/                    # Core business logic (ai, auth, db, email, queue, storage)
│   ├── worker/                 # BullMQ worker and processors
│   └── types/                  # Shared TypeScript types
├── migrations/                 # SQL migrations (001–008)
├── scripts/                    # migrate, seed, init-bucket, start
├── docs/                       # Platform documentation
├── docker-compose.yml          # Postgres, Redis, MinIO, app
└── Dockerfile                  # Production container
```

---

## Environment variables

See `.env.example` for the full reference. Required for core functionality:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (port `5433` for local Docker) |
| `REDIS_URL` | Redis connection (port `6380` for local Docker) |
| `SESSION_SECRET` | JWT signing (min 32 chars) — shared by admin, candidate, and vendor sessions |
| `ANTHROPIC_API_KEY` | Claude API for CV/JD parsing and ranking |
| `OPENAI_API_KEY` | Embeddings |
| `RESEND_API_KEY` | Email delivery |
| `S3_*` | CV file storage (MinIO defaults work for local dev) |

Optional: `TWILIO_*` (SMS OTP), `APOLLO_API_KEY` (prospect sourcing).

---

## Testing

```bash
npm run test           # run all tests
npm run test:watch     # watch mode
npm run type-check     # TypeScript check
```

Tests are in `src/lib/__tests__/` and cover auth, email helpers, AI wrappers, and utilities.

---

## What it does

**For candidates (public)**
- Browse open roles at `/jobs` and apply via a multi-step wizard: CV upload, contact details, work preferences, and custom screening questions
- Resume incomplete applications via saved draft links
- Confirm availability with one-click email links
- Unsubscribe from outreach emails

**For recruiters (admin)**
- Manage candidates, requirements, clients, and applications from `/admin`
- Review AI-ranked matches with scores and rationale for every open role
- Send templated outreach emails with delivery tracking
- Source external prospects via Apollo.io search and enrichment
- Export client-ready redacted CVs with agency branding
- Monitor analytics, notifications, and incomplete drafts

**Under the hood**
- CVs parsed by Claude (`tool_use` for structured output) with OpenAI embeddings for semantic search
- HNSW vector similarity + rule-based scoring + Claude re-ranking for candidate matching
- BullMQ background worker for CV parsing, matching, email, availability checks, and draft reminders
- Resend for transactional, outreach, and availability email streams

---

## Architecture

```
Browser
   │
   ▼
Next.js App (port 3000)          BullMQ Worker
   ├─ /jobs (public)                  ├─ cv-parse
   ├─ /admin (JWT-gated)              ├─ match
   └─ /api/* (REST)                   ├─ email
        │         │                   ├─ availability
        ▼         ▼                   └─ draft-reminder
      Redis   PostgreSQL + pgvector
                  │
              S3 / MinIO (CVs)
```

Two long-running processes share PostgreSQL and Redis. In production Docker/Railway, both run in a single container via `scripts/start.sh`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 18, TypeScript 5 |
| Database | PostgreSQL 16 + pgvector + pg_trgm |
| Queue / Cache | Redis 7 + BullMQ 5 |
| File Storage | S3-compatible (MinIO local, Cloudflare R2 / AWS S3 prod) |
| AI — Parsing & Ranking | Anthropic Claude (claude-sonnet-4-5) |
| AI — Embeddings | OpenAI text-embedding-3-small (1536-dim) |
| Email | Resend |
| SMS (optional) | Twilio |
| Sourcing (optional) | Apollo.io |
| Auth | JWT (jose), Argon2, TOTP 2FA |
| UI | Tailwind CSS 3, Radix UI, Lucide icons |

---

## Quick start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose

### Setup

```bash
git clone <repo-url>
cd nano
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, RESEND_API_KEY, SESSION_SECRET, APP_SECRET
./start.sh
```

Access:
- App: http://localhost:3000
- Admin: http://localhost:3000/admin (credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`)
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

For manual setup, port configuration, and production deployment, see [docs/setup.md](docs/setup.md).

---

## Scripts

| Command | Description |
|---|---|
| `./start.sh` | One-command dev start (infra + migrate + seed + app + worker) |
| `./start.sh prod` | Production mode locally |
| `npm run dev` | Next.js dev server |
| `npm run dev:worker` | Worker with hot reload |
| `npm run dev:all` | Both app and worker |
| `npm run build` | Production build |
| `npm run worker` | Production worker |
| `npm run db:migrate` | Run SQL migrations |
| `npm run db:seed` | Seed admin account |
| `npm run test` | Jest tests |
| `npm run type-check` | TypeScript check |

---

## Documentation

Full documentation is in the [docs/](docs/) folder:

| Document | Topics |
|---|---|
| [docs/README.md](docs/README.md) | Documentation index and platform overview |
| [Features](docs/features.md) | All platform features and capabilities |
| [Architecture](docs/architecture.md) | System design, auth, queues, data flows, security |
| [Application Flows](docs/flows.md) | Candidate apply, admin workflows, email, availability |
| [Admin Dashboard](docs/admin-dashboard.md) | Admin UI sections and recruiter actions |
| [API Reference](docs/api.md) | All REST endpoints |
| [Database Schema](docs/database.md) | Tables, indexes, relationships |
| [AI & Matching](docs/ai-matching.md) | CV parsing, embeddings, matching algorithm |
| [Worker & Queues](docs/worker.md) | BullMQ processors and cron jobs |
| [Integrations](docs/integrations.md) | Claude, OpenAI, Resend, Apollo, S3, Twilio |
| [Setup Guide](docs/setup.md) | Local dev, Docker, production |
| [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) | Railway deployment guide |

---

## Project structure

```
nano/
├── src/
│   ├── app/
│   │   ├── admin/              # Admin dashboard (auth + protected pages)
│   │   ├── api/                # REST API (admin + candidate)
│   │   ├── jobs/               # Public job board + application wizard
│   │   ├── availability/       # Availability confirmation
│   │   └── unsubscribe/        # Email unsubscribe
│   ├── components/             # UI and admin components
│   ├── lib/                    # Core business logic (ai, auth, db, email, queue, storage)
│   ├── worker/                 # BullMQ worker and processors
│   └── types/                  # Shared TypeScript types
├── migrations/                 # SQL migrations (001–006)
├── scripts/                    # migrate, seed, init-bucket, start
├── docs/                       # Platform documentation
├── docker-compose.yml          # Postgres, Redis, MinIO, app
└── Dockerfile                  # Production container
```

---

## Environment variables

See `.env.example` for the full reference. Required for core functionality:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (port `5433` for local Docker) |
| `REDIS_URL` | Redis connection (port `6380` for local Docker) |
| `SESSION_SECRET` | JWT signing (min 32 chars) |
| `ANTHROPIC_API_KEY` | Claude API for CV/JD parsing and ranking |
| `OPENAI_API_KEY` | Embeddings |
| `RESEND_API_KEY` | Email delivery |
| `S3_*` | CV file storage (MinIO defaults work for local dev) |

Optional: `TWILIO_*` (SMS OTP), `APOLLO_API_KEY` (prospect sourcing).

---

## Testing

```bash
npm run test           # run all tests
npm run test:watch     # watch mode
npm run type-check     # TypeScript check
```

Tests are in `src/lib/__tests__/` and cover auth, email helpers, AI wrappers, and utilities.
