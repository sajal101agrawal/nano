#!/bin/sh
set -e

echo "[start] Running database migrations..."
node /app/scripts/migrate.js

echo "[start] Seeding admin user..."
node /app/scripts/seed.js

echo "[start] Initialising S3 bucket..."
node /app/scripts/init-bucket.js

echo "[start] Starting background worker..."
node /app/src/worker/dist/index.js &
WORKER_PID=$!

echo "[start] Starting Next.js server..."
node server.js &
SERVER_PID=$!

# Handle shutdown gracefully
shutdown() {
  echo "[start] Shutting down services..."
  kill -TERM $WORKER_PID 2>/dev/null || true
  kill -TERM $SERVER_PID 2>/dev/null || true
  wait $WORKER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
  echo "[start] Services stopped"
  exit 0
}

trap shutdown SIGTERM SIGINT

# Wait for both processes
wait -n
exit $?
