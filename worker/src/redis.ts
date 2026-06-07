import "dotenv/config";
import type { ConnectionOptions } from "bullmq";

/**
 * Parses REDIS_URL into BullMQ ConnectionOptions.
 * Railway Redis URL format: redis://default:password@host:port
 * We only pass password (not username) since Railway Redis uses
 * single-password AUTH, not Redis 6 ACL multi-user auth.
 */
export function getRedisConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL || "redis://localhost:6379";
  const url = new URL(raw);

  const opts: ConnectionOptions = {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
  };

  // Railway (and most hosted Redis) uses password-only AUTH.
  // The username "default" in the URL is the ACL username — don't pass it
  // as a separate field or it triggers Redis 6 ACL auth instead of simple AUTH.
  if (url.password) {
    (opts as Record<string, unknown>).password = decodeURIComponent(url.password);
  }

  if (url.protocol === "rediss:") {
    (opts as Record<string, unknown>).tls = {};
  }

  return opts;
}
