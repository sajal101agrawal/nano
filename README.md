# Nano

Nano is a full-stack staff augmentation talent platform. It combines a public-facing candidate job board with a private admin dashboard, an AI-powered CV parsing and matching pipeline, automated availability tracking, and multi-stream email outreach — all backed by PostgreSQL with pgvector, Redis/BullMQ, and Anthropic Claude.

---

## What it does

- **Job Board**: Candidates browse open requirements and apply with a multi-step flow — CV upload, contact details, work preferences, and custom screening questions.
- **CV Parsing**: Uploaded CVs (PDF/DOCX) are parsed by Claude using tool-use for guaranteed structured output, generating a canonical profile, skill list, recruiter summary, and a semantic vector embedding.
- **AI Matching**: For every open requirement, the platform runs HNSW cosine-similarity search over all candidate embeddings, applies rule-based scoring (availability, contract preference, experience), then re-ranks the top 20 with a Claude prompt. Results are stored in the `matches` table.
- **Admin Dashboard**: Manage candidates, requirements, clients, applications, prospects, email outreach, and system notifications from a single interface.
- **Availability Tracking**: Token-based one-click availability checks sent via email; a daily bulk cron proactively pings idle candidates.
- **External Sourcing**: Apollo.io integration to search, enrich, and outreach prospects that have not yet applied.
- **Draft Applications**: If a candidate uploads a CV but does not finish, the partial draft is persisted and resumed via URL state. Abandonment reminders fire at 15 minutes and 6 hours.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 18) |
| Language | TypeScript 5 |
| Database | PostgreSQL 16 + pgvector + pg_trgm |
| Queue / Cache | Redis 7 + BullMQ 5 |
| File Storage | S3-compatible (Cloudflare R2 or AWS S3; MinIO for local dev) |
| AI — Parsing & Ranking | Anthropic Claude (claude-sonnet-4-5) |
| AI — Embeddings | OpenAI text-embedding-3-small (1536-dim) |
| Email | Resend |
| Authentication | JWT via jose, Argon2 password hashing, TOTP 2FA |
| Styling | Tailwind CSS 3 + Radix UI primitives |
| PDF Generation | @react-pdf/renderer, PDFKit |
| Background Worker | BullMQ (runs alongside Next.js in production) |

---

## Project structure

```
nano/
├── src/
│   ├── app/
│   │   ├── admin/                  # Admin dashboard pages (Next.js App Router)
│   │   │   ├── (auth)/login/       # Admin login + 2FA
│   │   │   └── (dashboard)/        # Protected admin pages
│   │   │       ├── candidates/     # Candidate list + detail
│   │   │       ├── requirements/   # Requirements list + create + detail
│   │   │       ├── prospects/      # External prospect search
│   │   │       ├── email/          # Email outreach UI
│   │   │       ├── analytics/      # Dashboard analytics
│   │   │       ├── drafts/         # Incomplete applications
│   │   │       ├── notifications/  # Admin notification inbox
│   │   │       └── settings/       # Profile, 2FA, agency settings
│   │   ├── api/
│   │   │   ├── admin/              # Admin REST API (JWT-protected)
│   │   │   └── candidate/          # Public candidate API
│   │   ├── jobs/                   # Public job board
│   │   ├── availability/           # Availability confirmation page
│   │   └── unsubscribe/            # Email unsubscribe page
│   ├── components/
│   │   ├── admin/                  # Admin-specific components
│   │   └── ui/                     # Base UI primitives
│   ├── lib/
│   │   ├── ai.ts                   # Claude wrappers (CV parse, JD parse, ranking)
│   │   ├── auth.ts                 # JWT session management, password hashing
│   │   ├── db.ts                   # PostgreSQL pool + query helpers
│   │   ├── email.ts                # Resend integration + template rendering
│   │   ├── embeddings.ts           # OpenAI embeddings + vector search helpers
│   │   ├── otp.ts                  # OTP generation/verification
│   │   ├── queue.ts                # BullMQ queue definitions + enqueue helpers
│   │   ├── redis.ts                # Redis client + rate limiting
│   │   └── storage.ts              # S3 upload / signed URL / delete
│   ├── worker/
│   │   ├── index.ts                # Worker entry point (all BullMQ workers)
│   │   ├── redis.ts                # Redis connection helper for workers
│   │   ├── scheduler.ts            # Cron job registration
│   │   └── processors/
│   │       ├── cvParse.ts          # CV download → text extract → Claude parse → embed
│   │       ├── match.ts            # Vector search → rule scoring → Claude re-rank
│   │       ├── availability.ts     # Send/expire availability tokens, bulk checks
│   │       ├── email.ts            # Send queued outreach emails via Resend
│   │       └── draftReminder.ts    # Draft abandonment reminders + expiry
│   ├── types/index.ts              # Shared TypeScript types
│   └── proxy.ts                    # Next.js middleware (admin auth guard)
├── migrations/                     # SQL migration files (run in order)
├── scripts/
│   ├── migrate.js                  # Migration runner
│   ├── seed.js                     # Admin user seed
│   ├── start.sh                    # Production startup (migrations + app + worker)
│   └── init-db.sql                 # Docker entrypoint init
├── docker-compose.yml              # Local infra: Postgres, Redis, MinIO
├── Dockerfile                      # Production container (Next.js + worker)
├── start.sh                        # One-command local dev start
└── .env.example                    # All environment variables documented
```

---

## Quick start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose

### 1. Clone and configure

```bash
git clone <repo-url>
cd nano
cp .env.example .env
```

Edit `.env` and fill in:
- `ANTHROPIC_API_KEY` — Claude API key
- `OPENAI_API_KEY` — OpenAI embeddings key
- `RESEND_API_KEY` — Resend email key
- `SESSION_SECRET` — at least 32 random characters
- `APP_SECRET` — at least 32 random characters

For local dev, the database, Redis, and MinIO credentials in `.env.example` already match the Docker Compose defaults and do not need to change.

### 2. Start everything

```bash
./start.sh
```

This script:
1. Starts Postgres, Redis, and MinIO containers
2. Waits for health checks
3. Runs database migrations
4. Seeds the admin account (from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`)
5. Starts the Next.js dev server and the BullMQ worker

Access:
- App: http://localhost:3000
- Admin: http://localhost:3000/admin
- MinIO console: http://localhost:9001 (credentials: `minioadmin` / `minioadmin`)

### 3. Manual start (without the script)

```bash
# Start infra
docker-compose up -d postgres redis minio

# Run migrations
npm run db:migrate

# Seed admin
npm run db:seed

# Start both app and worker in development mode
npm run dev:all

# Or run them separately in two terminals:
npm run dev         # Next.js app
npm run dev:worker  # Background worker
```

---

## Environment variables

See `.env.example` for the full reference. Key variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SESSION_SECRET` | JWT signing secret (min 32 chars) |
| `APP_SECRET` | General app secret |
| `S3_ACCESS_KEY_ID` | S3/R2 access key |
| `S3_SECRET_ACCESS_KEY` | S3/R2 secret key |
| `S3_BUCKET_NAME` | Bucket name for CV files |
| `S3_ENDPOINT` | Custom endpoint for R2 or MinIO |
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key (embeddings) |
| `EMBEDDINGS_MODEL` | Embedding model name (default: `text-embedding-3-small`) |
| `EMBEDDINGS_DIMENSIONS` | Embedding dimensions (default: `1536`) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM_TRANSACTIONAL` | From address for OTP/confirmation emails |
| `EMAIL_FROM_OUTREACH` | From address for outreach/availability emails |
| `TWILIO_ACCOUNT_SID` | Twilio SID (SMS OTP) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number |
| `APOLLO_API_KEY` | Apollo.io API key (prospect sourcing) |
| `ADMIN_EMAIL` | Initial admin email (used by seed) |
| `ADMIN_PASSWORD` | Initial admin password (used by seed) |
| `MAX_CV_SIZE_MB` | Max CV upload size (default: `10`) |
| `OTP_EXPIRY_MINUTES` | OTP validity window (default: `10`) |
| `AVAILABILITY_TOKEN_EXPIRY_DAYS` | Availability link TTL (default: `14`) |
| `AVAILABILITY_CHECK_INTERVAL_DAYS` | Days between auto availability checks (default: `21`) |

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Next.js dev server with hot reload |
| `npm run dev:worker` | Worker with tsx watch (hot reload) |
| `npm run dev:all` | Start both app and worker in dev mode (uses concurrently) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run worker` | Start worker (production) |
| `npm run db:migrate` | Run pending SQL migrations |
| `npm run db:seed` | Seed initial admin account |
| `npm run test` | Run Jest tests |
| `npm run type-check` | TypeScript type check (no emit) |
| `./start.sh` | One-command full start (dev mode) |
| `./start.sh prod` | One-command full start (production mode) |

---

## Docker (production)

```bash
# Build and start all services
docker-compose up --build

# Start only infrastructure for local dev
docker-compose up -d postgres redis minio
```

The production Docker setup runs both the Next.js app and the background worker in a single container. The `docker-compose.yml` includes:
- `nano_postgres` — pgvector/pgvector:pg16 on port 5433
- `nano_redis` — redis:7-alpine on port 6380
- `nano_minio` — MinIO on ports 9000/9001
- `nano_app` — Next.js app + worker on port 3000

---

## Documentation

Detailed documentation is in the `docs/` folder:

- [Architecture](docs/architecture.md) — system design, data flow, component relationships
- [Setup Guide](docs/setup.md) — local, staging, and production setup
- [Database Schema](docs/database.md) — all tables, columns, indexes, and relationships
- [API Reference](docs/api.md) — all REST endpoints with request/response details
- [Worker & Queues](docs/worker.md) — BullMQ queues, processors, scheduler, cron jobs
- [AI & Matching](docs/ai-matching.md) — CV parsing pipeline, embedding strategy, matching algorithm
- [Application Flows](docs/flows.md) — candidate apply flow, admin workflows, email flows

---

## Testing

```bash
npm run test           # run all tests
npm run test:watch     # watch mode
npm run type-check     # TypeScript check
```

Tests are in `src/lib/__tests__/` and cover auth utilities, email helpers, AI wrappers, and general utils.
