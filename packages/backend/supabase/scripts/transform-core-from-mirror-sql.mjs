import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

  const sqlPath = path.resolve(
    process.cwd(),
    "supabase",
    "scripts",
    "transform-core-from-mirror.sql"
  );
  const sql = await fs.readFile(sqlPath, "utf8");

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const run = await client.query(
    `insert into pos.migration_runs (source) values ('legacy_mirror_sql') returning id`
  );
  const runId = run.rows[0].id;

  try {
    await client.query(sql);
    const summary = await client.query(`
      select
        (select count(*)::int from pos.categories) +
        (select count(*)::int from pos.products) +
        (select count(*)::int from pos.inventory) +
        (select count(*)::int from pos.inventory_transactions) +
        (select count(*)::int from pos.orders) +
        (select count(*)::int from pos.order_items) +
        (select count(*)::int from pos.financial_transactions) +
        (select count(*)::int from pos.discounts) +
        (select count(*)::int from pos.site_settings) as total_rows
    `);
    await client.query(
      `update pos.migration_runs set finished_at = now(), upserted_count = $2 where id = $1`,
      [runId, summary.rows[0].total_rows]
    );
    console.log(`SQL core transform completed. total_rows=${summary.rows[0].total_rows}`);
  } catch (error) {
    await client.query(
      `update pos.migration_runs set finished_at = now(), failed_count = 1, notes = $2 where id = $1`,
      [runId, String(error?.message ?? error)]
    );
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("SQL core transform failed:", error);
  process.exitCode = 1;
});

