# Nano Platform Documentation

Nano is a full-stack staff augmentation talent platform. It combines a public candidate job board with a private admin dashboard, an AI-powered CV parsing and matching pipeline, automated availability tracking, draft application recovery, and multi-stream email outreach.

This folder contains detailed technical documentation for developers, operators, and integrators.

---

## Documentation index

| Document | Description |
|---|---|
| [Features & Capabilities](features.md) | Complete list of platform features, user-facing capabilities, and business logic |
| [Architecture](architecture.md) | System design, process model, auth, queues, data flows, security |
| [Application Flows](flows.md) | Step-by-step walkthroughs: candidate apply, admin workflows, email, availability |
| [Admin Dashboard](admin-dashboard.md) | Admin UI sections, pages, and common recruiter actions |
| [API Reference](api.md) | All REST endpoints with request/response formats |
| [Database Schema](database.md) | Tables, columns, indexes, relationships, vector search |
| [AI & Matching](ai-matching.md) | CV parsing pipeline, embeddings, matching algorithm, tuning |
| [Worker & Queues](worker.md) | BullMQ processors, cron jobs, enqueue patterns, monitoring |
| [Integrations](integrations.md) | Third-party services: Claude, OpenAI, Resend, Apollo, S3, Twilio |
| [Setup Guide](setup.md) | Local development, migrations, Docker, production deployment |

For Railway-specific deployment steps, see [RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md) in the repository root.

---

## Platform at a glance

### Two audiences

| Audience | Access | Primary actions |
|---|---|---|
| **Candidates** | Public (`/jobs`) | Browse roles, apply with CV, set preferences, answer screening questions |
| **Admins** | Private (`/admin`) | Manage talent pool, requirements, outreach, analytics, sourcing |

### Two processes

| Process | Role |
|---|---|
| **Next.js App** (port 3000) | HTTP server: public pages, admin UI, REST API |
| **BullMQ Worker** | Background jobs: CV parse, matching, email, availability, draft reminders |

Both share PostgreSQL (with pgvector) and Redis.

### Core pipelines

```
Application  →  CV Parse (Claude)  →  Embed (OpenAI)  →  Match (vector + rules + Claude)
Requirement  →  JD Parse (Claude)  →  Embed (OpenAI)  →  Match against candidate pool
Outreach     →  Template render  →  Queue  →  Resend  →  Webhook tracking
Availability →  Token email  →  One-click confirm  →  Update candidate status
```

### Tech stack summary

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 18, TypeScript 5 |
| Database | PostgreSQL 16 + pgvector + pg_trgm |
| Queue / Cache | Redis 7 + BullMQ 5 |
| Storage | S3-compatible (MinIO local, R2/S3 production) |
| AI parsing & ranking | Anthropic Claude (claude-sonnet-4-5) |
| Embeddings | OpenAI text-embedding-3-small (1536-dim) |
| Email | Resend |
| Auth | JWT (jose), Argon2, TOTP 2FA |
| UI | Tailwind CSS, Radix UI, Lucide icons |

---

## Quick links

- **Local start:** `./start.sh` — see [Setup Guide](setup.md)
- **Admin login:** `http://localhost:3000/admin` (credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- **Health check:** `GET /api/health`
- **Environment variables:** `.env.example`
