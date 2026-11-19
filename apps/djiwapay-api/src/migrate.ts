import { Pool } from "pg";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const url = process.env.DATABASE_URL; if (!url) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: url, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } });
const dir = join(import.meta.dir, "../migrations");
await pool.query("create table if not exists public.djiwapay_api_migrations(name text primary key, applied_at timestamptz not null default now())");
const files = new Map(readdirSync(dir).filter(x=>x.endsWith(".sql")).map(f=>[f,join(dir,f)]));
for (const name of ["20261115180412_finance_receipt_documents.sql", "20261120095000_finance_loan_reconciliation.sql"]) {
  const canonical = join(import.meta.dir, "../../../packages/backend/supabase/migrations", name);
  if (existsSync(canonical)) files.set(name, canonical);
}
for (const [f, path] of [...files.entries()].sort(([a],[b])=>a.localeCompare(b))) {
  if ((await pool.query("select 1 from public.djiwapay_api_migrations where name=$1", [f])).rowCount) continue;
  const client = await pool.connect();
  try {
    await client.query("begin"); await client.query("set local lock_timeout = '5s'"); await client.query(readFileSync(path, "utf8"));
    await client.query("insert into public.djiwapay_api_migrations(name) values($1)", [f]); await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
  console.log("applied", f);
}
await pool.end();
