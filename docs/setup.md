# Setup Guide

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 20 | Use `node --version` to check |
| npm | 10 | Bundled with Node 20 |
| Docker | 24 | For Postgres, Redis, MinIO containers |
| Docker Compose | 2.x | `docker compose` (v2) or `docker-compose` (v1) both supported |

External API keys required before the app is fully functional:
- Anthropic API key (CV parsing, matching, summaries)
- OpenAI API key (vector embeddings)
- Resend API key (email delivery)

Optional:
- Twilio credentials (SMS OTP — email OTP works without it)
- Apollo.io API key (external prospect sourcing)

---

## Local development

### 1. Clone and install

```bash
git clone <repo-url>
cd nano
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is required due to some peer dependency version conflicts in the React ecosystem.

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the required values. At minimum:

```env
SESSION_SECRET=<at-least-32-random-characters>
APP_SECRET=<at-least-32-random-characters>
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=YourSecurePassword123!
```

The database, Redis, and storage values already match the Docker Compose defaults for local dev:

```env
DATABASE_URL=postgresql://nano_user:nano_pass@localhost:5432/nano_db
REDIS_URL=redis://localhost:6379
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=nano-cvs
S3_ENDPOINT=http://localhost:9000
```

Note: `docker-compose.yml` maps Postgres to host port `5433` and Redis to `6380`, so the `DATABASE_URL` and `REDIS_URL` in `.env` should reflect those port numbers for local dev:

```env
DATABASE_URL=postgresql://nano_user:nano_pass@localhost:5433/nano_db
REDIS_URL=redis://localhost:6380
```

### 3. Start with the convenience script

```bash
./start.sh
```

This handles everything: starts containers, waits for health checks, runs migrations, seeds admin, and starts both the Next.js dev server and the worker.

Press `Ctrl+C` to stop all services.

### 4. Manual start (step by step)

```bash
# Start infrastructure
docker-compose up -d postgres redis minio

# Wait for containers to be healthy (check with `docker-compose ps`)

# Run migrations
npm run db:migrate

# Seed the admin user (idempotent — safe to re-run)
npm run db:seed

# Terminal 1: Next.js app
npm run dev

# Terminal 2: BullMQ worker
npm run worker:dev
```

### 5. Verify setup

- Open http://localhost:3000 — the job board (shows "No open positions" until you create a requirement)
- Open http://localhost:3000/admin — redirects to `/admin/login`
- Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`
- Open http://localhost:9001 with credentials `minioadmin` / `minioadmin` to verify MinIO is running

---

## Database migrations

Migrations are plain SQL files in `migrations/` numbered sequentially. The migration runner (`scripts/migrate.js`) tracks applied migrations in a `_migrations` table.

```bash
# Apply all pending migrations
npm run db:migrate
```

The runner:
1. Connects using `DATABASE_URL`
2. Creates a `_migrations` table if it does not exist
3. Runs each `migrations/*.sql` file that is not already recorded
4. Records applied migrations with a timestamp

Migrations are designed to be run once and never modified after deployment. Add new numbered files for schema changes.

### Migration order

| File | Contents |
|---|---|
| `001_initial_schema.sql` | All core tables, indexes, HNSW vector indexes, triggers |
| `002_default_templates.sql` | Default email templates |
| `003_draft_applications.sql` | `draft_applications` table |
| `004_app_settings.sql` | `app_settings` table |
| `005_matches_manual.sql` | Manual match support |
| `006_agency_seed.sql` | Agency/brand settings seed |

---

## MinIO bucket setup

In local dev, the `start.sh` script automatically creates the `nano-cvs` bucket in MinIO. If you start services manually, create the bucket:

```bash
# Using MinIO client (mc)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/nano-cvs

# Or open the MinIO console at http://localhost:9001 and create it manually
```

For production with Cloudflare R2 or AWS S3, create the bucket in your cloud console and set the correct credentials in `.env`.

---

## Production deployment

### Environment

Set `NODE_ENV=production` and update all secrets and API keys in your production environment variables. Ensure:

- `SESSION_SECRET` and `APP_SECRET` are long, random, unique per environment
- `NEXT_PUBLIC_APP_URL` points to your production domain
- `DATABASE_URL` points to your production Postgres instance (with pgvector extension installed)
- `S3_ENDPOINT` is either removed (for AWS S3) or set to your R2 URL

### Database

You need PostgreSQL 16 with the `pgvector` extension. For managed databases:

- **Supabase** — pgvector is available, enable it in the SQL editor: `CREATE EXTENSION IF NOT EXISTS vector;`
- **Neon** — pgvector is pre-installed
- **Self-hosted** — use the `pgvector/pgvector:pg16` Docker image (same as dev)

Run migrations on your production database:

```bash
DATABASE_URL=<prod-url> npm run db:migrate
```

### Building

```bash
npm run build
npm run start
```

Or with `start.sh`:

```bash
./start.sh prod
```

This runs `npm run build` before starting, then starts both the Next.js server and the worker.

### Docker Compose (full stack)

```bash
docker-compose up --build -d
```

This builds and starts all five services: `postgres`, `redis`, `minio`, `app`, `worker`.

For production, you likely want to:
- Replace the `minio` service with Cloudflare R2 or AWS S3
- Replace the `postgres` service with a managed database
- Use a managed Redis (e.g., Upstash, Redis Cloud)

### Separate app and worker

For production scale, run app and worker on separate machines:

```bash
# App server
docker build -f Dockerfile -t nano-app .
docker run -p 3000:3000 --env-file .env nano-app

# Worker server
docker build -f Dockerfile.worker -t nano-worker .
docker run --env-file .env nano-worker
```

Both need access to the same `DATABASE_URL` and `REDIS_URL`.

---

## Seeding

The seed script (`scripts/seed.js`) creates the admin user from `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` environment variables. It is idempotent — it skips creation if the email already exists.

```bash
npm run db:seed
```

The seed also populates default email templates (though this is handled by migration `002_default_templates.sql` instead — the seed only handles the admin user).

---

## Resend webhook setup

To track email delivery events (delivered, opened, clicked, bounced), configure a Resend webhook:

1. In your Resend dashboard, go to Webhooks
2. Add endpoint: `https://your-domain.com/api/admin/email/webhook`
3. Select events: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`

The webhook endpoint is public (excluded from admin auth middleware) and records events to the `email_events` table and updates `outreach_messages.status`.

---

## Twilio setup (optional, for SMS OTP)

SMS OTP is used as an alternative to email OTP for candidate authentication. Without Twilio credentials, only email OTP works.

1. Create a Twilio account
2. Purchase a phone number
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` in `.env`

---

## Apollo.io setup (optional, for prospect sourcing)

The prospect search feature requires an Apollo.io API key with People Search access.

1. Create an Apollo.io account and generate an API key
2. Set `APOLLO_API_KEY` in `.env`

---

## Common issues

### Postgres connection refused

The Docker Compose maps Postgres to port `5433` (not `5432`) to avoid conflicts with a local Postgres installation. Ensure your `DATABASE_URL` uses port `5433` for local dev.

### Redis connection refused

Similarly, Redis is mapped to `6380`. Set `REDIS_URL=redis://localhost:6380` in `.env`.

### CV uploads failing

Check that MinIO is running (`docker-compose ps`) and the bucket exists. Check `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` in `.env`.

### Worker not processing jobs

Check the worker process is running (`npm run worker:dev`). Check Redis connectivity. Check that `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set (the worker requires both).

### Claude rate limit errors

The app and worker both include retry logic with exponential backoff. Rate limit errors (429 / error code `rate_limit`) trigger a 30-second pause before retry. If errors persist, check your Anthropic usage tier.
