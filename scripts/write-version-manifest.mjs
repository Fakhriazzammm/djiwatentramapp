import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBuildMetadata } from "./version-metadata.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const metadata = getBuildMetadata(rootDir);

// A package build runs with that app as cwd. Only update the current app so
// one app's deploy cannot publish a newer manifest for every other app.
const allApps = ["apps/admin", "apps/pos", "apps/customer", "apps/karyawan", "apps/ordermieyamin", "apps/booking", "apps/linkbio", "apps/merchandise", "apps/b2b", "apps/kolmarketing"];
const cwdRelative = resolve(process.cwd()).startsWith(`${rootDir}/apps/`) ? resolve(process.cwd()).slice(rootDir.length + 1) : "";
const apps = cwdRelative && allApps.includes(cwdRelative) ? [cwdRelative] : allApps;

for (const app of apps) {
	const outputPath = resolve(rootDir, app, "public/version.json");
	try {
		mkdirSync(dirname(outputPath), { recursive: true });
		writeFileSync(
			outputPath,
			`${JSON.stringify(
				{
					version: metadata.version,
					commitHash: metadata.commitHash,
					message: metadata.commitMessage,
					buildDate: metadata.buildDate,
					generatedAt: metadata.generatedAt,
				},
				null,
				2,
			)}\n`,
		);
	} catch {
		console.warn(`⚠ Skipping ${app}/public/version.json (not available)`);
	}
}

console.log(`✓ Version manifest written to ${apps.length} apps (${metadata.version})`);
