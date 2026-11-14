import { Pool } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const url = process.env.DATABASE_URL; if (!url) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: url, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } });
const dir = join(import.meta.dir, "../migrations");
await pool.query("create table if not exists public.djiwapay_api_migrations(name text primary key, applied_at timestamptz not null default now())");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  if ((await pool.query("select 1 from public.djiwapay_api_migrations where name=$1", [f])).rowCount) continue;
  await pool.query("begin"); await pool.query(readFileSync(join(dir, f), "utf8")); await pool.query("insert into public.djiwapay_api_migrations(name) values($1)", [f]); await pool.query("commit");
  console.log("applied", f);
}
await pool.end();
