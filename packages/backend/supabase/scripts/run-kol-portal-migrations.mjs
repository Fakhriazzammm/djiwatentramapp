import "dotenv/config";
import fs from "node:fs/promises";
import process from "node:process";
import { Client } from "pg";
import { resolveMigrationPath } from "./migration-utils.mjs";

const migrationFiles = [
  "20261006000000_kol_collaboration_inquiries.sql",
  "20261006000100_kol_shared_visit_admin.sql",
];

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

  const migrations = await Promise.all(migrationFiles.map(async (fileName) => ({
    fileName,
    sql: await fs.readFile(await resolveMigrationPath(fileName), "utf8"),
  })));
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query("BEGIN");
    for (const migration of migrations) await client.query(migration.sql);
    await client.query("COMMIT");
    console.log(`Applied ${migrations.length} idempotent KOL migrations transactionally: ${migrationFiles.join(", ")}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("KOL portal migrations failed:", error);
  process.exitCode = 1;
});
