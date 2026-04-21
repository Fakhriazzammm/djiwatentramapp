import "dotenv/config";
import fs from "node:fs/promises";
import process from "node:process";
import { Client } from "pg";
import { resolveMigrationPath } from "./migration-utils.mjs";

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("SUPABASE_DB_URL is required");

  const sqlPath = await resolveMigrationPath("0007_booking_and_dashboard_views.sql");
  const sql = await fs.readFile(sqlPath, "utf8");

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(sql);
    console.log("Booking/dashboard views migration applied from 0007_booking_and_dashboard_views.sql");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Booking/dashboard views migration failed:", error);
  process.exitCode = 1;
});
