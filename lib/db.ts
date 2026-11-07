import pg from "pg";

/**
 * Postgres access (node-postgres). App traffic uses the POOLED Neon string (DATABASE_URL);
 * migrations use the direct one (DATABASE_URL_UNPOOLED, see scripts/migrate.mjs).
 * Server-only: never import from client components or middleware (edge runtime).
 */
const g = globalThis as unknown as { __pgPool?: pg.Pool };

function pool(): pg.Pool {
  if (!g.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    g.__pgPool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
    g.__pgPool.on("error", (e) => console.error("pg pool error", e.message));
  }
  return g.__pgPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}

export async function withTx<T>(fn: (q: (text: string, params?: unknown[]) => Promise<pg.QueryResultRow[]>) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(async (text, params = []) => (await c.query(text, params)).rows);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Fixed-window rate limit backed by Postgres (shared across instances). Returns true when allowed. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const row = await queryOne<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count)
     VALUES ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [key, windowSec],
  );
  // opportunistic cleanup of old windows
  if (Math.random() < 0.02) query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'").catch(() => {});
  return (row?.count ?? 1) <= max;
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}
