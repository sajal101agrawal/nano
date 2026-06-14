# Third-Party Integrations

Nano connects to several external services. This document describes each integration, configuration, and where it is used in the codebase.

---

## Anthropic Claude

**Model:** `claude-sonnet-4-5`

**Environment variable:** `ANTHROPIC_API_KEY`

**Used for:**

| Use case | Location | Method |
|---|---|---|
| CV structured extraction (background) | `src/worker/processors/cvParse.ts` | `tool_use` with `extract_cv` schema |
| CV quick parse (draft creation) | `src/lib/ai.ts` → `extractCVStructured()` | Text response + JSON extraction |
| Recruiter summary generation | `src/worker/processors/cvParse.ts`, `src/lib/ai.ts` | Text completion |
| JD requirements parsing | `src/lib/ai.ts` → `extractJDRequirements()` | Text response + JSON extraction |
| Candidate re-ranking | `src/worker/processors/match.ts` | Text response + JSON extraction |
| Prospect summary | `src/lib/ai.ts` → `generateProspectSummary()` | Text completion |

**Retry behavior:** Rate limit errors (429 / `rate_limit`) trigger a 30-second pause. Other errors use exponential backoff (max 10s). Default 3 retries.

**Token limits:**
- CV text truncated at 15,000 characters before extraction
- JD text truncated at 4,000 characters for embedding
- Re-rank prompt: JD truncated at 1,500 characters

---

## OpenAI Embeddings

**Model:** `text-embedding-3-small` (default)

**Environment variables:**
- `OPENAI_API_KEY`
- `EMBEDDINGS_MODEL` (default: `text-embedding-3-small`)
- `EMBEDDINGS_DIMENSIONS` (default: `1536`)

**Used for:**

| Use case | Location |
|---|---|
| Candidate profile embedding | `src/worker/processors/cvParse.ts` |
| Requirement JD embedding | `src/worker/processors/match.ts` |
| Vector search helpers | `src/lib/embeddings.ts` |

**Embedding text composition (candidates):**
```
<summary>. Current role: <title> at <company>. Skills: <top 20>. Experience: <top 4 roles>. <headline>. <domain>
```

**Storage:** PostgreSQL `vector(1536)` with HNSW index (`m=16`, `ef_construction=64`).

**Retry behavior:** 3 attempts with exponential backoff. Input text truncated at 8,192 characters.

---

## Resend (Email)

**Environment variables:**
- `RESEND_API_KEY`
- `EMAIL_FROM_TRANSACTIONAL` — OTP, application confirmations
- `EMAIL_FROM_OUTREACH` — outreach and availability emails
- `EMAIL_FROM_NAME` — display name
- `EMAIL_REPLY_TO` — reply-to address

**Used for:**

| Stream | Emails |
|---|---|
| `transactional` | OTP codes, application confirmations, draft reminders |
| `availability` | Availability check tokens |
| `outreach` | Candidate and prospect outreach |

**Key files:**
- `src/lib/email.ts` — send helpers, template rendering, suppression checks
- `src/worker/processors/email.ts` — queued email delivery
- `src/worker/processors/availability.ts` — direct availability email send
- `src/worker/processors/draftReminder.ts` — draft abandonment emails

**Webhook:** `POST /api/admin/email/webhook` receives delivery events. Configure in Resend dashboard:
- Endpoint: `https://your-domain.com/api/admin/email/webhook`
- Events: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`

Updates `outreach_messages.status` and inserts into `email_events`.

---

## Twilio (SMS OTP)

**Environment variables:**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

**Optional.** Without Twilio credentials, only email OTP works.

**Used for:** `src/lib/otp.ts` — sends 6-digit OTP via SMS when `identifierType = phone`.

**Rate limiting:** `OTP_RATE_LIMIT_PER_HOUR` (default 5) per identifier. Expiry: `OTP_EXPIRY_MINUTES` (default 10).

---

## Apollo.io (Prospect Sourcing)

**Environment variable:** `APOLLO_API_KEY`

**Optional.** Search returns empty results if not configured or set to placeholder value.

**API endpoints used:**

| Apollo API | Nano route | Purpose |
|---|---|---|
| `POST /v1/mixed_people/search` | `POST /api/admin/prospects/search` | Search people by skills, title, location, seniority |
| `POST /v1/people/match` | `POST /api/admin/prospects/[id]/enrich` | Reveal personal email (synchronous) |

**Data flow:**
1. Search results upserted into `prospects` table (dedup by `provider` + `provider_profile_id`)
2. Enrich updates `email` and `email_status` on the prospect row
3. Outreach uses the same email system as candidates

**Note:** An `enrichment` BullMQ queue is defined in `src/lib/queue.ts` but has no worker consumer. Enrichment runs synchronously in the API route.

---

## S3-Compatible Storage

**Environment variables:**
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME` (default: `nano-cvs`)
- `S3_REGION`
- `S3_ENDPOINT` — required for MinIO and Cloudflare R2

**Providers:**

| Environment | Provider |
|---|---|
| Local dev | MinIO (Docker, ports 9000/9001) |
| Production | Cloudflare R2 (recommended) or AWS S3 |

**Key file:** `src/lib/storage.ts`

**Operations:**
- Upload CV with UUID key: `cvs/<uuid>.<ext>`
- Presigned download URLs (1-hour TTL) for admin access
- Delete on re-upload or cleanup
- `forcePathStyle: true` when `S3_ENDPOINT` is set (required for MinIO/R2)

**Bucket initialization:** `scripts/init-bucket.js` runs on production startup.

**Accepted formats:** PDF and DOCX only.

---

## PostgreSQL + pgvector

**Environment variable:** `DATABASE_URL`

**Extensions:**
- `vector` — 1536-dim embeddings with HNSW ANN indexes
- `uuid-ossp` — UUID primary keys
- `pg_trgm` — fuzzy search on names and skills

**Pool settings:** `DATABASE_POOL_MIN` (default 2), `DATABASE_POOL_MAX` (default 10)

**Local dev:** Docker image `pgvector/pgvector:pg16`, host port `5433`.

**Managed options:** Supabase, Neon, Railway Postgres plugin (with pgvector enabled).

---

## Redis + BullMQ

**Environment variable:** `REDIS_URL`

Railway also supports individual variables: `REDISHOST`, `REDISPORT`, `REDISUSER`, `REDISPASSWORD`.

**Used for:**
- BullMQ job queues (5 queues)
- Rate limiting (`src/lib/redis.ts`)
- Session-adjacent caching

**Local dev:** Docker `redis:7-alpine`, host port `6380`.

---

## Integration dependency matrix

| Feature | Claude | OpenAI | Resend | S3 | Redis | Postgres | Apollo | Twilio |
|---|---|---|---|---|---|---|---|---|
| Apply with CV | Quick parse | — | Confirm | Upload | — | Store | — | — |
| Full CV parse | Required | Required | — | Download | Queue | Store | — | — |
| Matching | Re-rank | Embed | — | — | Queue | Vector search | — | — |
| Outreach email | — | — | Required | — | Queue | Store | — | — |
| Availability check | — | — | Required | — | Queue | Store | — | — |
| Draft reminders | — | — | Required | — | Cron | Store | — | — |
| Prospect search | — | — | — | — | — | Store | Required | — |
| SMS OTP | — | — | — | — | Rate limit | Store | — | Optional |

**Minimum for core functionality:** Claude, OpenAI, Resend, S3, Redis, Postgres.
