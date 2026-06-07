import "dotenv/config";
import type { ConnectionOptions } from "bullmq";

/**
 * Builds BullMQ ConnectionOptions from environment variables.
 *
 * Prefers Railway's individual REDISHOST/REDISPASSWORD/etc. variables
 * (automatically injected when the Redis plugin is linked to a service)
 * over parsing REDIS_URL, because URL parsing can mangle passwords and
 * Railway's individual vars are always up to date.
 */
export function getRedisConnection(): ConnectionOptions {
  // Railway injects these individual vars from the Redis plugin
  if (process.env.REDISHOST) {
    const hasPassword = !!process.env.REDISPASSWORD;
    const hasUsername = !!process.env.REDISUSER;
    console.log(`[redis] Using REDISHOST host=${process.env.REDISHOST}:${process.env.REDISPORT || "6379"} hasPassword=${hasPassword} hasUsername=${hasUsername}`);
    const opts: Record<string, unknown> = {
      host: process.env.REDISHOST,
      port: parseInt(process.env.REDISPORT || "6379"),
    };
    if (process.env.REDISUSER) opts.username = process.env.REDISUSER;
    if (process.env.REDISPASSWORD) opts.password = process.env.REDISPASSWORD;
    return opts as ConnectionOptions;
  }

  // Fall back to REDIS_URL
  const raw = process.env.REDIS_URL || "redis://localhost:6379";
  const url = new URL(raw);
  const hasPassword = !!url.password;
  const hasUsername = !!url.username;
  console.log(`[redis] Using REDIS_URL host=${url.hostname} hasPassword=${hasPassword} hasUsername=${hasUsername}`);
  const opts: Record<string, unknown> = {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
  };
  if (url.username) opts.username = decodeURIComponent(url.username);
  if (url.password) opts.password = decodeURIComponent(url.password);
  if (url.protocol === "rediss:") opts.tls = {};
  return opts as ConnectionOptions;
}

