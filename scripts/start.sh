#!/bin/sh
set -e

echo "[start] Running database migrations..."
node /app/scripts/migrate.js

echo "[start] Initialising S3 bucket..."
node /app/scripts/init-bucket.js

echo "[start] Starting Next.js server..."
exec node server.js
