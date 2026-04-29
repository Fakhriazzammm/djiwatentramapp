import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const outputPath = resolve(rootDir, "apps/web/public/version.json");

function runCommand(cmd, fallback) {
	try {
		return execSync(cmd, { cwd: rootDir, encoding: "utf-8" }).trim();
	} catch {
		return fallback;
	}
}

const commitHash = runCommand("git rev-parse --short HEAD", "local");
const buildDate = new Date().toISOString().split("T")[0];
const commitCount = runCommand("git rev-list --count HEAD", "0");

let baseVersion = "0.1.0";
try {
	const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
	baseVersion = pkg.version || baseVersion;
} catch {}

const [major, minor] = baseVersion.split(".");
const version = `${major}.${minor}.${commitCount}`;

writeFileSync(
	outputPath,
	`${JSON.stringify(
		{
			version,
			commitHash,
			buildDate,
			generatedAt: new Date().toISOString(),
		},
		null,
		2,
	)}\n`,
);

console.log(`✓ Version manifest written: ${outputPath}`);
