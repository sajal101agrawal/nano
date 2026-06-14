# Worker & Queues

## Overview

The background worker is a standalone Node.js process (`src/worker/index.ts`) that runs separately from the Next.js app. It processes all asynchronous jobs using BullMQ backed by Redis.

Starting the worker:

```bash
# Development (with file watching)
npm run dev:worker

# Production (compiled)
npm run build:worker
npm run worker
```

The worker connects to the same PostgreSQL database and Redis instance as the Next.js app. It also connects to S3/MinIO for CV files and uses the Anthropic and OpenAI APIs.

---

## Queue definitions

Five queues are defined in `src/lib/queue.ts` (used by the Next.js app to enqueue jobs) and consumed by the worker:

| Queue name | Concurrency | Retry policy | Purpose |
|---|---|---|---|
| `cv-parse` | 3 | 3 attempts, exponential backoff (2s base) | Parse a candidate's CV |
| `email` | 10 | 3 attempts, exponential backoff (1s base) | Send an outreach or transactional email |
| `match` | 2 | 2 attempts, fixed delay (5s) | Compute AI matches for a requirement |
| `availability` | 5 | 3 attempts, exponential backoff (5s base) | Send or expire availability tokens; bulk checks |
| `draft-reminder` | 1 | 3 attempts, exponential backoff (5s base) | Send draft abandonment reminders; expire stale drafts |

Job retention: completed jobs retained 24 hours, failed jobs retained 7 days.

---

## Processors

### `cvParseProcessor` (`src/worker/processors/cvParse.ts`)

Processes jobs from the `cv-parse` queue. Triggered by `POST /api/candidate/apply` via `enqueueCVParse()`.

**Job data:**
```typescript
{
  profileId: string;
  candidateId: string;
  applicationId: string;
  cvUrl: string;
  cvKey: string;
  mimeType: string;
}
```

**Steps:**

1. Set `candidate_profiles.parse_status = processing`, `applications.status = parsing`
2. Download the CV from S3 using the provided `cvKey`
3. Extract raw text:
   - DOCX: `mammoth.extractRawText()` — confidence 1.0 if no warnings, 0.8 otherwise
   - PDF: `pdf-parse` — confidence 1.0 if pages > 0 and text > 100 chars, 0.6 otherwise
   - If text length < 50 chars → mark as `review_required` and notify admins
4. Call Claude (`claude-sonnet-4-5`) with `tool_use` and the `extract_cv` tool schema (guaranteed structured output):
   - Extracts all fields: personal info, roles, education, skills, projects, certifications, awards, publications, languages, volunteer work
   - If `total_experience_years` is missing from the output, it is calculated from role start/end dates
5. Generate recruiter summary — call Claude again for a 3–4 sentence professional summary in third person, avoiding filler phrases
6. Update `candidates` core fields from parsed data (email, phone, name, headline, title, company, experience, location) — only fills NULL fields, does not overwrite existing values
7. Save `parsed_json` and `summary` to `candidate_profiles`; set `parse_status = completed`
8. Delete and re-insert all `candidate_skills` rows for this candidate
9. Build embedding text: `summary + headline + skills + recent roles` → call OpenAI embeddings API → store `vector(1536)` on `candidate_profiles.embedding`
10. Set `applications.status = parsed`
11. Enqueue a `match` job for every open requirement this candidate has applied to

**Error handling:**
- On non-final attempts: throw error to allow BullMQ to retry
- On final attempt: set `parse_status = failed`, `applications.status = parse_failed`, notify all admin/recruiter users via `notifications` table
- `review_required` is set immediately (no retry) when text extraction fails below threshold

---

### `matchProcessor` (`worker/src/processors/match.ts`)

Processes jobs from the `match` queue. Triggered after CV parsing or manually via the admin dashboard.

**Job data:**
```typescript
{
  requirementId: string;
  topN?: number;  // default: 50
}
```

**Steps:**

1. Load requirement from DB; generate and store embedding if missing
2. Run HNSW cosine-similarity search: top `topN` active candidates ordered by `embedding <=> req_embedding` (with optional `min_experience` filter)
3. Always include all applicants for this requirement (regardless of top-N cutoff) — fetched separately and merged
4. Apply rule-based score adjustments to each candidate:
   - `availability_status = unavailable` → `rule_score × 0.1`
   - `availability_status = unknown` → `rule_score × 0.6`
   - `open_to_contract = false` when `engagement_type = contract` → `rule_score × 0.3`
5. Compute combined score: `(vector_score × 0.6 + rule_score × 0.4) × 100`, clamped 0–100
6. Take top 20 by combined score
7. Call Claude to re-rank the top 20: provide job description + candidate summaries, receive `[{ candidateId, score, rationale }]`
8. Merge AI scores: candidates in the Claude response use the AI score; remaining candidates use the combined score
9. UPSERT all results into the `matches` table

**Error handling:** If Claude re-ranking fails, step 8 falls back to the combined score silently.

---

### `emailProcessor` (`worker/src/processors/email.ts`)

Processes jobs from the `email` queue. Triggered by `POST /api/admin/email/send` via `enqueueEmail()`.

**Job data:**
```typescript
{
  messageId: string;
  to: string;
  subject: string;
  html: string;
  stream: "transactional" | "availability" | "outreach";
  threadId?: string;
  tags?: Array<{ name: string; value: string }>;
  cc?: string[];
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}
```

**Steps:**

1. Check suppression list — if suppressed, mark message as failed and return (no send)
2. Send via Resend with 3 retries (exponential backoff)
3. Set `from` address based on stream (`transactional` uses `EMAIL_FROM_TRANSACTIONAL`, others use `EMAIL_FROM_OUTREACH`)
4. If `threadId` is provided, add `In-Reply-To` and `References` headers
5. Update `outreach_messages` row: set `status = sent`, `esp_message_id`, `sent_at`

---

### `availabilityProcessor` (`worker/src/processors/availability.ts`)

Processes jobs from the `availability` queue. Three job types are handled.

**Job type: `send_check`**

Triggered manually from admin or automatically in some flows.

1. Load candidate from DB (must be `active` and have `primary_email`)
2. Generate a UUID token, compute expiry (`AVAILABILITY_TOKEN_EXPIRY_DAYS` days from now)
3. Insert into `availability_events` with `source = system`, `status = unknown`
4. Build one-click URLs: `NEXT_PUBLIC_APP_URL/availability/confirm?token=<t>&s=available|unavailable`
5. Send availability check email via Resend directly (not queued)

**Job type: `expire_token`** (run hourly by cron)

1. Find all `availability_events` where `token_used = FALSE` and `expires_at < NOW()`
2. Mark them: `token_used = TRUE`, `status = unknown`
3. For each expired event, reset the candidate's `availability_status` to `unknown` (only if currently `available`)

**Job type: `bulk_check`** (run daily at 9am UTC by cron)

1. Find up to 50 active candidates:
   - Have `primary_email`
   - `availability_status IN ('available', 'unknown')`
   - `last_active_at` is NULL or older than `AVAILABILITY_CHECK_INTERVAL_DAYS` days ago
   - No availability check sent within the last `AVAILABILITY_CHECK_INTERVAL_DAYS` days
2. Call `sendAvailabilityCheck()` for each, with a 500ms delay between sends (rate limiting)

---

### `draftReminderProcessor` (`worker/src/processors/draftReminder.ts`)

Processes jobs from the `draft-reminder` queue. Three job types are handled.

**Job type: `check_15m`** (run every 5 minutes by cron)

1. Find draft applications that:
   - `status = draft`
   - `reminder_sent_15m = FALSE`
   - Created more than 15 minutes ago
   - Have `parsed_email` (to send reminder to)
2. Send a reminder email
3. Set `reminder_sent_15m = TRUE`

**Job type: `check_6h`** (run every 30 minutes by cron)

1. Find draft applications that:
   - `status = draft`
   - `reminder_sent_6h = FALSE`
   - Created more than 6 hours ago
2. Send a second reminder email
3. Set `reminder_sent_6h = TRUE`

**Job type: `expire_stale`** (run daily at midnight UTC by cron)

1. Find draft applications with `status = draft` created more than 7 days ago
2. Set `status = expired`

---

## Scheduler (`src/worker/scheduler.ts`)

The scheduler registers recurring BullMQ `repeat` jobs on startup. Cron patterns are in UTC.

| Job ID | Queue | Pattern | Description |
|---|---|---|---|
| `expire-availability-tokens` | `availability` | `0 * * * *` | Every hour — expire stale tokens |
| `bulk-availability-check` | `availability` | `0 9 * * *` | Daily at 9am UTC — bulk availability checks |
| `draft-reminder-15m` | `draft-reminder` | `*/5 * * * *` | Every 5 minutes — check for 15-min abandoned drafts |
| `draft-reminder-6h` | `draft-reminder` | `*/30 * * * *` | Every 30 minutes — check for 6-hour abandoned drafts |
| `draft-expire-stale` | `draft-reminder` | `0 0 * * *` | Daily at midnight UTC — expire 7-day-old drafts |

Repeat jobs use `removeOnComplete: true` so completed repeating jobs do not accumulate in Redis.

---

## Graceful shutdown

The worker handles `SIGINT` and `SIGTERM`:

```typescript
async function shutdown() {
  await Promise.all([
    cvWorker.close(),
    emailWorker.close(),
    matchWorker.close(),
    availabilityWorker.close(),
    draftReminderWorker.close(),
  ]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

`worker.close()` waits for in-progress jobs to complete before stopping.

---

## Database connection in the worker

The worker uses `pg.Pool` directly (not the shared `src/lib/db.ts` which uses `postgres` package). Each processor creates its own pool with a small max connection count (3–5) to avoid overloading the database.

```typescript
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
```

---

## Enqueueing from the Next.js app

The app enqueues jobs using helpers from `src/lib/queue.ts`:

```typescript
// After a new application is submitted
await enqueueCVParse({ profileId, candidateId, applicationId, cvUrl, cvKey, mimeType });

// After creating/updating a requirement
await enqueueMatch({ requirementId, topN: 50 });

// To send an availability check
await enqueueAvailabilityCheck({ type: "send_check", candidateId, requirementId });

// To send an email
await enqueueEmail({ messageId, to, subject, html, stream });
```

Jobs use a deterministic `jobId` where deduplication matters:
- CV parse: `cv-<profileId>` (prevents duplicate parses)
- Match: `match-<requirementId>` (prevents queuing multiple matches for the same requirement simultaneously)

---

## Monitoring

Worker logs use a consistent `[worker:<queue>]` prefix:

```
[worker] Starting nano background worker...
[worker:cv-parse] Job abc123 completed
[worker:match] Job xyz456 failed (attempt 1/2): ...
[worker:availability] Worker error: connection refused
```

For production monitoring, consider:
- Collecting stdout/stderr to a log aggregator
- Setting up BullMQ Board or Bull Dashboard for queue inspection
- Alerting on job failure rates via queue event listeners
