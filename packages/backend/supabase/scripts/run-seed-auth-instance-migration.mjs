import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..", "..");

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

  const sqlPath = path.resolve(
    repoRoot,
    "supabase",
    "migrations",
    "0013_seed_auth_instance.sql"
  );
  const sql = await fs.readFile(sqlPath, "utf8");

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(sql);
    console.log("Auth instance seed migration applied from 0013_seed_auth_instance.sql");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Auth instance seed migration failed:", error);
  process.exitCode = 1;
});
