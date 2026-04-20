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
    "migrations",
    "0008_inventory_admin_read_support.sql"
  );
  const sql = await fs.readFile(sqlPath, "utf8");

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(sql);
    console.log("Inventory admin read support migration applied from 0008_inventory_admin_read_support.sql");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Inventory admin read support migration failed:", error);
  process.exitCode = 1;
});
