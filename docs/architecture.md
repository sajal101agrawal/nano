# Architecture

## Overview

Nano is composed of two long-running processes that share a PostgreSQL database and Redis:

1. **Next.js App** — handles all HTTP traffic: the public candidate-facing job board, the protected admin dashboard, and all REST API routes.
2. **BullMQ Worker** — a standalone Node.js process that processes background jobs: CV parsing, AI matching, email delivery, availability checks, and draft reminders.

```
Browser
   │
   ▼
Next.js App (port 3000)
   ├─ Public pages:  /jobs, /jobs/[slug], /availability/confirm, /unsubscribe
   ├─ Admin pages:   /admin/* (JWT-gated via middleware)
   └─ API routes:    /api/admin/*, /api/candidate/*
            │                  │
            │ write jobs        │ SQL queries
            ▼                  ▼
          Redis           PostgreSQL + pgvector
            │                  ▲
            │ dequeue           │ SQL queries
            ▼                  │
      BullMQ Worker ───────────┘
            │
            ├─ cv-parse queue    → S3 + Claude + OpenAI
            ├─ match queue       → OpenAI + Claude
            ├─ email queue       → Resend
            ├─ availability queue→ Resend
            └─ draft-reminder    → Resend
```

---

## Process separation

The app and worker are intentionally separate processes. This allows:
- Independent scaling (e.g., run 3 app replicas, 1 worker)
- Worker failures do not affect HTTP response times
- Worker can be restarted during CV processing without affecting the web server

In `docker-compose.yml` they are separate services (`nano_app`, `nano_worker`). In local dev, `start.sh` starts them as two background processes in the same shell.

---

## Authentication model

Two distinct session types exist, both using HS256 JWT stored as HttpOnly cookies:

### Admin sessions (`nano_admin_session`)

- 7-day expiry
- Carries: `{ userId, email, name, role, totpVerified }`
- Enforced by `src/proxy.ts` (Next.js middleware) on all `/admin/*` and `/api/admin/*` paths except `/api/admin/auth/*` and the email webhook
- Optional TOTP 2FA — when enabled, `totpVerified` must be true; the admin is forced through the 2FA page on login

### Candidate sessions (`nano_candidate_session`)

- 24-hour expiry
- Carries: `{ candidateId?, identifier, identifierType, verified }`
- Used for OTP-based authentication during the application flow (candidates verify by email/phone OTP, not password)

---

## Middleware (proxy.ts)

`src/proxy.ts` is the Next.js middleware (`matcher: ["/admin/:path*", "/api/admin/:path*"]`). It:
1. Adds security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) to all matched routes
2. Verifies the `nano_admin_session` JWT for admin API routes (returns 401 JSON on failure)
3. Redirects unauthenticated admin page requests to `/admin/login`

---

## Database

PostgreSQL 16 with three extensions:
- **pgvector** — stores 1536-dimension float vectors on `candidate_profiles.embedding` and `requirements.embedding`; HNSW indexes for ANN search
- **uuid-ossp** — `uuid_generate_v4()` for primary keys
- **pg_trgm** — trigram GIN indexes on `candidates.full_name` and `candidate_skills.skill` for fuzzy text search

The database client (`src/lib/db.ts`) uses the `pg` package with a connection pool (configurable min/max via `DATABASE_POOL_MIN` / `DATABASE_POOL_MAX`).

---

## File storage

CV files are stored in an S3-compatible bucket. In production this is Cloudflare R2 (cost-efficient, no egress fees). In local dev it is MinIO running in Docker.

The storage layer (`src/lib/storage.ts`):
- Uploads with a UUID key: `cvs/<uuid>.<ext>`
- Always sets `forcePathStyle: true` when `S3_ENDPOINT` is set (required for R2 and MinIO)
- Generates presigned download URLs (1-hour TTL) for admin access
- CV max size is configurable via `MAX_CV_SIZE_MB` (default 10 MB)
- Only PDF and DOCX mime types are accepted

---

## Queue architecture

Five BullMQ queues are defined in `src/lib/queue.ts` and consumed by the worker:

| Queue | Concurrency | Retry | Purpose |
|---|---|---|---|
| `cv-parse` | 3 | 3x exponential (2s base) | Full CV pipeline |
| `email` | 10 | 3x exponential (1s base) | Send email via Resend |
| `match` | 2 | 2x fixed (5s) | Vector search + AI re-rank |
| `availability` | 5 | 3x exponential (5s base) | Availability tokens + bulk checks |
| `draft-reminder` | 1 | 3x exponential (5s base) | Draft abandonment emails + expiry |

Jobs are enqueued by the Next.js app after events (e.g., after a successful application `POST`, `enqueueCVParse()` is called immediately). The worker processes them asynchronously.

Completed jobs are retained for 24 hours; failed jobs for 7 days (for debugging).

---

## AI integration

Two AI providers are used:

### Anthropic Claude (`claude-sonnet-4-5`)

Used for:
1. **CV structured extraction** (worker `cvParse.ts`) — uses `tool_use` with a strict JSON schema to guarantee parse-safe output. Extracts all candidate fields.
2. **Recruiter summary generation** — a 3–4 sentence professional summary written in third person.
3. **JD requirements extraction** (`src/lib/ai.ts`) — parses raw job description text into structured fields.
4. **Candidate re-ranking** (worker `match.ts`) — given the top 20 vector-similar candidates, Claude re-scores and provides a rationale per candidate.

### OpenAI (`text-embedding-3-small`, 1536 dims)

Used for generating vector embeddings:
- **Candidate embedding** — built from summary + headline + skills + recent roles
- **Requirement embedding** — built from the raw JD text

Both embeddings are stored as `vector(1536)` columns and indexed with HNSW (`m=16, ef_construction=64`) for fast ANN search.

---

## Email streams

Emails are sent via Resend and are tagged with one of three logical streams:

| Stream | From address | Used for |
|---|---|---|
| `transactional` | `EMAIL_FROM_TRANSACTIONAL` | OTP codes, application confirmations |
| `availability` | `EMAIL_FROM_OUTREACH` | Availability check tokens |
| `outreach` | `EMAIL_FROM_OUTREACH` | Candidate and prospect outreach |

The suppression list (`suppression_list` table) is checked before every outreach/availability email. Unsubscribes, bounces, and spam complaints are tracked via the Resend webhook (`POST /api/admin/email/webhook`).

---

## Admin roles

Three roles exist in the `users` table:

| Role | Capabilities |
|---|---|
| `admin` | Full access to all features |
| `recruiter` | All access except user management |
| `viewer` | Read-only access |

Role enforcement is currently handled at the API route level. The middleware only checks for a valid session, not a specific role.

---

## Data flow: candidate application

```
Candidate uploads CV
        │
        ▼
POST /api/candidate/draft          ← creates draft_applications row, parses CV with Claude (quick parse)
        │
        ▼
Candidate fills details + preferences
        │
        ▼
POST /api/candidate/apply
  ├─ Upsert candidate row
  ├─ Create candidate_profile row (parse_status: pending)
  ├─ Create application row (status: applied)
  ├─ Store application_answers
  ├─ Insert availability_events (source: application, status: available)
  └─ Enqueue cv-parse job
        │
        ▼
Worker: cvParseProcessor
  ├─ Download CV from S3
  ├─ Extract text (pdf-parse / mammoth)
  ├─ Claude tool_use extraction
  ├─ Calculate total_experience_years from role dates if needed
  ├─ Generate recruiter summary (Claude)
  ├─ Update candidate core fields
  ├─ Upsert candidate_skills
  ├─ Generate OpenAI embedding
  ├─ Store embedding on candidate_profiles
  ├─ Update parse_status → completed
  ├─ Update application status → parsed
  └─ Enqueue match job for all open requirements this candidate applied to
```

---

## Data flow: AI matching

```
Admin triggers match (POST /api/admin/requirements/[id]/match)
  OR auto-triggered by cvParseProcessor after parsing
        │
        ▼
Worker: matchProcessor
  ├─ Load requirement (get or generate embedding)
  ├─ Vector ANN search: top 50 active candidates by cosine similarity
  ├─ Always include all applicants (even outside top 50)
  ├─ Apply rule-based score adjustments:
  │    availability=unavailable → ×0.1
  │    availability=unknown     → ×0.6
  │    not open to contract     → ×0.3 (when req is contract)
  ├─ Combined score = vector_score×0.6 + rule_score×0.4, clamped 0–100
  ├─ Claude re-ranks top 20, returns score + rationale per candidate
  ├─ Merge AI scores into final results
  └─ UPSERT into matches table
```

---

## Security considerations

- Admin passwords are hashed with Argon2 (fallback to PBKDF2-SHA512 if native Argon2 is unavailable)
- JWTs are signed with HS256 using a minimum-32-char secret
- Rate limiting on application submission (10 per IP per hour) via Redis
- OTP rate limit (5 per identifier per hour) and expiry (10 minutes)
- Email suppression list prevents re-sending to unsubscribed/bounced addresses
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy` headers on all admin routes
- Availability tokens are one-time use UUIDs with configurable expiry (default 14 days)
- CV files are served via presigned URLs (1-hour TTL), never as public direct links
