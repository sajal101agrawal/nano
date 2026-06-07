import "dotenv/config";
import type { ConnectionOptions } from "bullmq";

/**
 * Parses REDIS_URL into BullMQ ConnectionOptions.
 * Railway Redis uses Redis 6 ACL and requires AUTH with both username and
 * password (two-argument form). ioredis sends this when both fields are set.
 */
export function getRedisConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL || "redis://localhost:6379";
  const url = new URL(raw);

  const opts: Record<string, unknown> = {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
  };

  if (url.username) opts.username = decodeURIComponent(url.username);
  if (url.password) opts.password = decodeURIComponent(url.password);
  if (url.protocol === "rediss:") opts.tls = {};

  return opts as ConnectionOptions;
}
