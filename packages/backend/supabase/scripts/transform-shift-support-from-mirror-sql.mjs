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
		"transform-shift-support-from-mirror.sql"
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
        (select count(*)::int from pos.shifts) as shifts_count,
        (select count(*)::int from pos.financial_targets) as targets_count
    `);
		console.log(
			`Shift support transform completed. shifts=${summary.rows[0].shifts_count} targets=${summary.rows[0].targets_count}`
		);
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error("Shift support transform failed:", error);
	process.exitCode = 1;
});
