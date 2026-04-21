import "dotenv/config";
import fs from "node:fs/promises";
import process from "node:process";
import { Client } from "pg";
import { resolveMigrationPath } from "./migration-utils.mjs";

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

  const sqlPath = await resolveMigrationPath("0014_normalize_supabase_auth_user_tokens.sql");
  const sql = await fs.readFile(sqlPath, "utf8");

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(sql);
    console.log(
      "Supabase auth token normalization applied from 0014_normalize_supabase_auth_user_tokens.sql"
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Supabase auth token normalization failed:", error);
  process.exitCode = 1;
});
