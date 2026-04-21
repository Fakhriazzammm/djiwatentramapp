import "dotenv/config";
import fs from "node:fs/promises";
import process from "node:process";
import { Client } from "pg";
import { resolveMigrationPath } from "./migration-utils.mjs";

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

  const sqlPath = await resolveMigrationPath("0009_hpp_read_support.sql");
  const sql = await fs.readFile(sqlPath, "utf8");

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(sql);
    console.log("HPP read support migration applied from 0009_hpp_read_support.sql");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("HPP read support migration failed:", error);
  process.exitCode = 1;
});
