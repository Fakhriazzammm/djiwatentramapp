import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../../");
const webDir = path.resolve(repoRoot, "apps", "web");
const hooksDir = path.resolve(webDir, "src", "hooks");

loadEnv({ path: path.resolve(repoRoot, ".env") });
loadEnv({ path: path.resolve(webDir, ".env"), override: true });
loadEnv({ path: path.resolve(webDir, ".env.local"), override: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey =
	process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !publishableKey) {
	console.error(
		"[ERROR] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY"
	);
	process.exit(1);
}

const supabase = createClient(supabaseUrl, publishableKey, {
	auth: { persistSession: false },
});

function collectTablesFromReadHooks() {
	const files = fs
		.readdirSync(hooksDir)
		.filter(
			(name) =>
				name.startsWith("use-hybrid-") &&
				name.endsWith(".ts") &&
				name !== "use-hybrid-write-actions.ts"
		);

	const tables = new Map();
	for (const fileName of files) {
		const fullPath = path.resolve(hooksDir, fileName);
		const text = fs.readFileSync(fullPath, "utf8");
		const regex =
			/(?:\.schema\("([a-zA-Z0-9_]+)"\)\s*)?\.from\("([a-zA-Z0-9_]+)"\)/g;
		let match;
		while ((match = regex.exec(text))) {
			const schema = match[1] || "public";
			const table = match[2];
			tables.set(`${schema}.${table}`, { schema, table });
		}
	}

	return [...tables.values()].sort((a, b) =>
		`${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`)
	);
}

async function checkTableAccess(targets) {
	const ok = [];
	const failed = [];

	for (const target of targets) {
		const query =
			target.schema === "public"
				? supabase.from(target.table)
				: supabase.schema(target.schema).from(target.table);
		const { error } = await query.select("*").limit(1);
		const fqName = `${target.schema}.${target.table}`;
		if (error) {
			failed.push({
				table: fqName,
				code: error.code || "UNKNOWN",
				message: error.message || "Unknown error",
			});
		} else {
			ok.push(fqName);
		}
	}

	return { ok, failed };
}

async function checkRealtimeSubscription() {
	return new Promise((resolve) => {
		const channel = supabase
			.channel(`frontend-healthcheck:${Date.now()}`)
			.on("postgres_changes", { event: "*", schema: "public" }, () => {})
			.subscribe((status) => {
				if (status === "SUBSCRIBED") {
					void supabase.removeChannel(channel);
					resolve({ ok: true, status });
				}
				if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
					void supabase.removeChannel(channel);
					resolve({ ok: false, status });
				}
			});

		setTimeout(() => {
			void supabase.removeChannel(channel);
			resolve({ ok: false, status: "TIMEOUT_WAITING_STATUS" });
		}, 4000);
	});
}

async function main() {
	const targets = collectTablesFromReadHooks();
	const { ok, failed } = await checkTableAccess(targets);
	const realtime = await checkRealtimeSubscription();

	console.log(
		`[INFO] Frontend read table access: ${ok.length}/${targets.length} passed`
	);
	for (const table of ok) {
		console.log(`[OK] ${table}`);
	}

	if (failed.length > 0) {
		for (const item of failed) {
			console.error(`[FAIL] ${item.table} (${item.code}): ${item.message}`);
		}
	}

	if (realtime.ok) {
		console.log(`[OK] Realtime subscription status: ${realtime.status}`);
	} else {
		console.error(`[FAIL] Realtime subscription status: ${realtime.status}`);
	}

	if (failed.length > 0 || !realtime.ok) {
		process.exit(1);
	}
}

await main();
