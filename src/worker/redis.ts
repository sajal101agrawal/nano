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
  // Debug: check which env vars are available
  console.log(`[redis] ENV check: REDISHOST=${process.env.REDISHOST ? "set" : "unset"}, REDIS_URL=${process.env.REDIS_URL ? "set" : "unset"}`);
  
  // Railway injects these individual vars from the Redis plugin
  if (process.env.REDISHOST) {
    const hasPassword = !!process.env.REDISPASSWORD;
    const hasUsername = !!process.env.REDISUSER;
    console.log(`[redis] Using REDISHOST host=${process.env.REDISHOST}:${process.env.REDISPORT || "6379"} hasPassword=${hasPassword} hasUsername=${hasUsername}`);
    const opts: ConnectionOptions = {
      host: process.env.REDISHOST,
      port: parseInt(process.env.REDISPORT || "6379"),
      username: process.env.REDISUSER || undefined,
      password: process.env.REDISPASSWORD || undefined,
      maxRetriesPerRequest: null, // Required for BullMQ
    };
    return opts;
  }

  // Fall back to REDIS_URL
  const raw = process.env.REDIS_URL || "redis://localhost:6379";
  
  // Parse URL carefully - Railway URLs can have special characters in passwords
  const url = new URL(raw);
  
  // Debug: log what we're parsing
  console.log(`[redis] Using REDIS_URL host=${url.hostname}:${url.port || "6379"} user=${url.username || "none"} passLen=${url.password?.length || 0}`);
  
  const opts: ConnectionOptions = {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
  };
  
  // Handle TLS for rediss:// protocol
  if (url.protocol === "rediss:") {
    opts.tls = {};
  }
  
  return opts;
}
