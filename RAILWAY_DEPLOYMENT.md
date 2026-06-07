# Railway Deployment Guide

This guide explains how to deploy Nano to Railway as a single unified service.

## Architecture

The application runs as a single container that includes both:
- Next.js web server (port 3000)
- BullMQ background worker

This simplified architecture:
- Reduces deployment complexity (one service instead of two)
- Eliminates Redis authentication issues between services
- Uses fewer Railway resources
- Simplifies environment variable management

## Prerequisites

1. Railway account
2. Railway CLI installed (optional but recommended)

## Setup Steps

### 1. Create New Project

```bash
# Using Railway CLI
railway login
railway init

# Or use the Railway dashboard
```

### 2. Add Required Services

Add these plugins to your Railway project:
- PostgreSQL (with pgvector)
- Redis

Railway will automatically inject these environment variables:
- `DATABASE_URL`
- `REDIS_URL` or `REDISHOST`, `REDISPORT`, `REDISUSER`, `REDISPASSWORD`

### 3. Configure Environment Variables

In your Railway service settings, add these environment variables:

```bash
# App Configuration
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-app.up.railway.app
APP_SECRET=your-super-secret-key-change-this-minimum-32-chars
SESSION_SECRET=your-session-secret-change-this-minimum-32-chars

# S3/R2 Storage (use Cloudflare R2 or AWS S3)
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-bucket-name
S3_REGION=auto
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com

# AI Services
ANTHROPIC_API_KEY=sk-ant-your-key
OPENAI_API_KEY=sk-your-openai-key
EMBEDDINGS_MODEL=text-embedding-3-small
EMBEDDINGS_DIMENSIONS=1536

# Email (Resend)
RESEND_API_KEY=re_your-key
EMAIL_FROM_TRANSACTIONAL=noreply@yourdomain.com
EMAIL_FROM_OUTREACH=talent@yourdomain.com
EMAIL_FROM_NAME=Your Company Name
EMAIL_REPLY_TO=contact@yourdomain.com

# SMS (Optional - Twilio)
TWILIO_ACCOUNT_SID=ACyour-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890

# Admin Credentials
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=ChangeMe!SecurePassword
ADMIN_NAME=Admin

# Optional: Apollo.io integration
APOLLO_API_KEY=your-apollo-key

# Configuration
MAX_CV_SIZE_MB=10
OTP_RATE_LIMIT_PER_HOUR=5
OTP_EXPIRY_MINUTES=10
AVAILABILITY_TOKEN_EXPIRY_DAYS=14
AVAILABILITY_CHECK_INTERVAL_DAYS=21
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

### 4. Deploy

```bash
# Using Railway CLI
railway up

# Or push to GitHub and connect the repo in Railway dashboard
git push
```

Railway will:
1. Build the Docker image
2. Run database migrations
3. Initialize S3 bucket
4. Start both Next.js and the background worker

### 5. Verify Deployment

Check the logs to ensure:
- Database migrations completed successfully
- S3 bucket initialized
- Worker started successfully
- Next.js server is running

Look for these log entries:
```
[start] Running database migrations...
[start] Initialising S3 bucket...
[start] Starting background worker...
[worker] Starting nano background worker...
[worker] All workers running. Waiting for jobs...
[start] Starting Next.js server...
```

## Redis Authentication

The application uses a smart Redis connection strategy:

1. First, it tries Railway-injected variables: `REDISHOST`, `REDISPORT`, `REDISUSER`, `REDISPASSWORD`
2. Falls back to parsing `REDIS_URL` if individual variables aren't available

This approach prevents authentication issues that can occur when manually parsing Redis URLs.

## Monitoring

### View Logs

```bash
railway logs
```

### Health Check

The application exposes a health endpoint:
```
GET https://your-app.up.railway.app/api/health
```

## Troubleshooting

### Redis Authentication Errors

If you see "NOAUTH Authentication required" errors:

1. Verify Redis plugin is linked to your service
2. Check that Railway injected the Redis variables (check the Variables tab)
3. Restart the service after linking Redis plugin

### Database Connection Issues

1. Verify PostgreSQL plugin is linked
2. Check `DATABASE_URL` format: `postgresql://user:password@host:port/database`
3. Ensure pgvector extension is enabled (should be automatic with Railway's PostgreSQL)

### Worker Not Processing Jobs

1. Check logs for worker startup messages
2. Verify Redis connection is working
3. Ensure environment variables are correctly set

### Build Failures

1. Check Node.js version (requires 20+)
2. Verify all dependencies are in `package.json`
3. Look for TypeScript errors in build logs

## Scaling

To scale the application:

1. Go to your Railway service settings
2. Under "Deployment", increase the number of replicas

Note: Each replica runs both the web server AND worker. This works well because:
- BullMQ automatically distributes jobs across all worker instances
- Redis acts as the central coordinator
- No race conditions or duplicate processing

For very high loads, you may want to:
1. Split back into separate web and worker services
2. Scale them independently
3. Run multiple worker replicas with fewer web replicas

## Cost Optimization

To reduce Railway costs:

1. Use Cloudflare R2 for file storage (free tier available)
2. Set appropriate `DATABASE_POOL_MAX` (default: 10)
3. Monitor Redis memory usage and adjust `maxmemory` if needed
4. Use Railway's free tier for development/staging environments

## Updates

To deploy updates:

```bash
git push
```

Railway automatically:
1. Detects changes
2. Builds new Docker image
3. Runs health checks
4. Does zero-downtime deployment

## Rolling Back

If something goes wrong:

```bash
railway rollback
```

Or use the Railway dashboard to rollback to a previous deployment.
