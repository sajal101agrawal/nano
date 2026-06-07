#!/usr/bin/env bash
set -e

# =============================================
# Nano — Platform Start Script
# =============================================
# This script starts all services (infra + app + worker),
# runs migrations, seeds admin if not present.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[nano]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[nano]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[nano]${NC} $1"; }
log_error() { echo -e "${RED}[nano]${NC} $1"; }

# ─── Check prerequisites ───────────────────────────────────────────────────────
for cmd in docker docker-compose node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    # try docker compose (v2)
    if [ "$cmd" = "docker-compose" ] && docker compose version &>/dev/null; then
      DOCKER_COMPOSE="docker compose"
      continue
    fi
    log_error "Required command not found: $cmd"
    exit 1
  fi
done
DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker-compose}"

# ─── Copy .env if missing ──────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    log_warn ".env not found — copying from .env.example"
    cp .env.example .env
  else
    log_error ".env file not found. Create one from .env.example"
    exit 1
  fi
fi

# Load env vars for later use
set -o allexport
source .env
set +o allexport

MODE="${1:-dev}"

log_info "Starting Nano platform in '$MODE' mode..."

# ─── Install dependencies ─────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  log_info "Installing npm dependencies..."
  npm install --legacy-peer-deps
fi

# ─── Start infrastructure containers ─────────────────────────────────────────
log_info "Starting infrastructure (Postgres, Redis, MinIO)..."
$DOCKER_COMPOSE up -d postgres redis minio

# ─── Wait for Postgres ───────────────────────────────────────────────────────
log_info "Waiting for Postgres to be ready..."
RETRIES=30
until $DOCKER_COMPOSE exec -T postgres pg_isready -U nano_user -d nano_db &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    log_error "Postgres did not become ready in time."
    exit 1
  fi
  sleep 2
done
log_ok "Postgres is ready."

# ─── Wait for Redis ──────────────────────────────────────────────────────────
log_info "Waiting for Redis to be ready..."
RETRIES=20
until $DOCKER_COMPOSE exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    log_error "Redis did not become ready in time."
    exit 1
  fi
  sleep 2
done
log_ok "Redis is ready."

# ─── Wait for MinIO and create bucket ────────────────────────────────────────
log_info "Waiting for MinIO to be ready..."
RETRIES=20
until curl -sf http://localhost:9000/minio/health/live &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    log_warn "MinIO health check timed out — continuing anyway."
    break
  fi
  sleep 2
done

# Create bucket if not exists (best-effort)
if command -v mc &>/dev/null; then
  mc alias set local http://localhost:9000 minioadmin minioadmin &>/dev/null || true
  mc mb --ignore-existing local/${S3_BUCKET_NAME:-nano-cvs} &>/dev/null || true
  log_ok "MinIO bucket ready."
else
  # Use node to create bucket
  node -e "
const { S3Client, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin' },
  forcePathStyle: true,
});
const bucket = process.env.S3_BUCKET_NAME || 'nano-cvs';
client.send(new HeadBucketCommand({ Bucket: bucket }))
  .catch(() => client.send(new CreateBucketCommand({ Bucket: bucket })))
  .then(() => console.log('Bucket OK'))
  .catch(e => console.warn('Bucket setup:', e.message));
" 2>/dev/null || true
fi

# ─── Run database migrations ──────────────────────────────────────────────────
log_info "Running database migrations..."
if ! node scripts/migrate.js; then
  log_error "Migrations failed. Check the error above."
  exit 1
fi
log_ok "Migrations complete."

# ─── Seed admin if not present ───────────────────────────────────────────────
log_info "Checking admin account..."
node scripts/seed.js
log_ok "Seed check complete."

# ─── Start app and worker ────────────────────────────────────────────────────
if [ "$MODE" = "prod" ]; then
  log_info "Building Next.js app..."
  npm run build
  log_info "Starting app (production)..."
  npm run start &
  APP_PID=$!
  log_info "Starting worker (production)..."
  node -r tsx/cjs worker/src/index.ts &
  WORKER_PID=$!
else
  log_info "Starting app (development)..."
  npm run dev &
  APP_PID=$!
  log_info "Starting worker (development)..."
  npx tsx watch worker/src/index.ts &
  WORKER_PID=$!
fi

log_ok ""
log_ok "================================================"
log_ok " Nano is running!"
log_ok "  App:    http://localhost:3000"
log_ok "  Admin:  http://localhost:3000/admin"
log_ok "  MinIO:  http://localhost:9001"
log_ok "================================================"
log_ok ""

# ─── Graceful shutdown ────────────────────────────────────────────────────────
cleanup() {
  log_info "Shutting down..."
  kill "$APP_PID" "$WORKER_PID" 2>/dev/null || true
  $DOCKER_COMPOSE stop postgres redis minio
  log_ok "All services stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

wait "$APP_PID" "$WORKER_PID"
