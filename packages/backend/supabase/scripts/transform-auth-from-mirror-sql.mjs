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
		"transform-auth-from-mirror.sql"
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
        (select count(*)::int from public.yumi_roles) as roles_count,
        (select count(*)::int from public.yumi_users) as users_count,
        (select count(*)::int from public.yumi_sessions) as sessions_count
    `);
		console.log(
			`Auth transform completed. roles=${summary.rows[0].roles_count} users=${summary.rows[0].users_count} sessions=${summary.rows[0].sessions_count}`
		);
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error("Auth transform failed:", error);
	process.exitCode = 1;
});
