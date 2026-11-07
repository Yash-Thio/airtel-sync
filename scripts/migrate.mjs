// Applies db/migrations/*.sql in order. Uses the DIRECT (non-pooled) connection: DATABASE_URL_UNPOOLED.
// Run with: npm run db:migrate   (loads .env.local via node --env-file)
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set");
  process.exit(1);
}
const dir = path.join(process.cwd(), "db", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log("applied", f);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  console.log("migrations up to date");
} finally {
  await client.end();
}
