import { Pool, PoolClient } from "pg";

declare global {
  var _pgPool: Pool | undefined;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    min: parseInt(process.env.DATABASE_POOL_MIN || "2"),
    max: parseInt(process.env.DATABASE_POOL_MAX || "10"),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    console.error("[db] Unexpected pool error:", err.message);
  });

  return pool;
}

export const pool: Pool =
  process.env.NODE_ENV === "production"
    ? createPool()
    : (globalThis._pgPool ?? (globalThis._pgPool = createPool()));

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  let retries = 3;

  while (retries > 0) {
    try {
      const res = await pool.query(text, params);
      if (process.env.NODE_ENV === "development") {
        const duration = Date.now() - start;
        if (duration > 1000) {
          console.warn(`[db] Slow query (${duration}ms):`, text.slice(0, 80));
        }
      }
      return res.rows as T[];
    } catch (err: unknown) {
      retries--;
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable =
        message.includes("connection") ||
        message.includes("timeout") ||
        message.includes("ECONNREFUSED");

      if (!isRetryable || retries === 0) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 500 * (4 - retries)));
    }
  }
  throw new Error("Query failed after retries");
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}
