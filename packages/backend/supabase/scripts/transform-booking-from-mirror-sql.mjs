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
    "scripts",
    "transform-booking-from-mirror.sql"
  );
  const sql = await fs.readFile(sqlPath, "utf8");

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(sql);
    const summary = await client.query(`
      select
        (select count(*)::int from pos.booking_settings) as booking_settings_count,
        (select count(*)::int from pos.booking_date_capacity) as booking_capacity_count,
        (select count(*)::int from pos.booking_orders) as booking_orders_count,
        (select count(*)::int from pos.booking_order_items) as booking_order_items_count
    `);
    console.log(
      `Booking transform completed. settings=${summary.rows[0].booking_settings_count} capacity=${summary.rows[0].booking_capacity_count} orders=${summary.rows[0].booking_orders_count} items=${summary.rows[0].booking_order_items_count}`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Booking transform failed:", error);
  process.exitCode = 1;
});
