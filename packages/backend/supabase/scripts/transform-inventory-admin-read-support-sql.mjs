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
    "transform-inventory-admin-read-support.sql"
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
        (select count(*)::int from pos.inventory_stores) as inventory_stores_count,
        (select count(*)::int from pos.recipes) as recipes_count,
        (select count(*)::int from pos.base_recipes) as base_recipes_count
    `);
    console.log(
      `Inventory admin read support transform completed. stores=${summary.rows[0].inventory_stores_count} recipes=${summary.rows[0].recipes_count} base_recipes=${summary.rows[0].base_recipes_count}`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Inventory admin read support transform failed:", error);
  process.exitCode = 1;
});
