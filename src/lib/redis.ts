import Redis from "ioredis";

declare global {
  var _redisClient: Redis | undefined;
}

function createRedis(): Redis {
  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 3000);
    },
    reconnectOnError(err) {
      return err.message.includes("READONLY");
    },
    lazyConnect: false,
    enableOfflineQueue: true,
  });

  redis.on("error", (err) => {
    console.error("[redis] Connection error:", err.message);
  });

  redis.on("connect", () => {
    if (process.env.NODE_ENV === "development") {
      console.log("[redis] Connected");
    }
  });

  return redis;
}

export const redis: Redis =
  process.env.NODE_ENV === "production"
    ? createRedis()
    : (globalThis._redisClient ?? (globalThis._redisClient = createRedis()));

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const val = await redis.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds = 300
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.warn("[redis] setCache failed:", err);
  }
}

export async function delCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.warn("[redis] delCache failed:", err);
  }
}

export async function delCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.warn("[redis] delCachePattern failed:", err);
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const multi = redis.multi();
  multi.incr(key);
  multi.ttl(key);

  const results = await multi.exec();
  if (!results) return { allowed: true, remaining: limit, resetIn: 0 };

  const count = results[0][1] as number;
  const ttl = results[1][1] as number;

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  const remaining = Math.max(0, limit - count);
  const resetIn = ttl > 0 ? ttl : windowSeconds;

  return {
    allowed: count <= limit,
    remaining,
    resetIn,
  };
}
