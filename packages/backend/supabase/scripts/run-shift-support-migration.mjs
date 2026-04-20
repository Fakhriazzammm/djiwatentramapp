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
		"0005_shift_support.sql"
	);
	const sql = await fs.readFile(sqlPath, "utf8");

	const client = new Client({
		connectionString: dbUrl,
		ssl: { rejectUnauthorized: false },
	});
	await client.connect();

	try {
		await client.query("begin");
		await client.query(sql);
		await client.query("commit");
		console.log("Shift support migration applied:", sqlPath);
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error("Failed to run shift support migration:", error);
	process.exitCode = 1;
});
