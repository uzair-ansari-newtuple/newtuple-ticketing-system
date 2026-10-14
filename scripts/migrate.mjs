import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env");

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set. Run `neon env pull`.");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const file of readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    await client.query("BEGIN");
    await client.query(readFileSync(`db/migrations/${file}`, "utf8"));
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    await client.query("COMMIT");
    console.log(`applied ${file}`);
  }
  console.log("migrations up to date");
} catch (err) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw err;
} finally {
  await client.end();
}
