# Nano — Staff Augmentation Talent Platform

Built by [Sajal Tech](https://sajaltech.com). Internal talent infrastructure for staff augmentation operations.

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env
# Edit .env with your API keys

# 2. Start everything (infra + migrations + app + worker)
./start.sh

# 3. Open the platform
# App:   http://localhost:3000
# Admin: http://localhost:3000/admin
# MinIO: http://localhost:9001
```

Default admin credentials (change after first login):
- Email: `admin@sajaltech.com`  
- Password: `Admin@Nano2024!`

## Stack

- **Frontend/Backend**: Next.js 14 (App Router)
- **Database**: PostgreSQL 16 + pgvector (HNSW)
- **Queue/Cache**: Redis + BullMQ
- **File Storage**: S3-compatible (MinIO for local dev, AWS S3/R2 for prod)
- **AI**: Anthropic Claude (CV extraction, matching, summaries)
- **Embeddings**: OpenAI text-embedding-3-small
- **Email**: Resend
- **SMS OTP**: Twilio

## Development

```bash
# Start infra only
docker compose up -d postgres redis minio

# Run migrations
node scripts/migrate.js

# Seed admin
node scripts/seed.js

# Start Next.js app
npm run dev

# Start background worker (separate terminal)
npx tsx watch worker/src/index.ts
```

## Testing

```bash
npm test
npm run test:watch
```

## Production

```bash
./start.sh prod
```

## Environment Variables

See `.env.example` for all required variables.
