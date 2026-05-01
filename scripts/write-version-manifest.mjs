import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBuildMetadata } from "./version-metadata.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const outputPath = resolve(rootDir, "apps/web/public/version.json");
const metadata = getBuildMetadata(rootDir);

writeFileSync(
	outputPath,
	`${JSON.stringify(
		{
			version: metadata.version,
			commitHash: metadata.commitHash,
			buildDate: metadata.buildDate,
			generatedAt: metadata.generatedAt,
		},
		null,
		2,
	)}\n`,
);

console.log(`✓ Version manifest written: ${outputPath}`);
