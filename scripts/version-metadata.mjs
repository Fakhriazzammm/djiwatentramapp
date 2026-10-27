import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function runCommand(rootDir, cmd, fallback = "") {
	try {
		return execSync(cmd, { cwd: rootDir, encoding: "utf-8" }).trim();
	} catch {
		return fallback;
	}
}

function normalizeCommit(value) {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, 7);
}

function getEnvCommitHash() {
	return (
		normalizeCommit(process.env.CF_PAGES_COMMIT_SHA) ||
		normalizeCommit(process.env.RENDER_GIT_COMMIT) ||
		normalizeCommit(process.env.COMMIT_REF) ||
		normalizeCommit(process.env.SOURCE_VERSION) ||
		""
	);
}

function getBaseVersion(rootDir) {
	let baseVersion = "0.1.0";
	try {
		const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
		baseVersion = pkg.version || baseVersion;
	} catch {}
	return baseVersion;
}

const COUNTER_FILE = "scripts/BUILD_NUMBER";

function readCounterValue(rootDir) {
	const counterPath = resolve(rootDir, COUNTER_FILE);
	try {
		const raw = readFileSync(counterPath, "utf-8").trim();
		const parsed = parseInt(raw, 10);
		return !isNaN(parsed) && parsed > 0 ? parsed : 1;
	} catch {
		return 1;
	}
}

function writeCounterValue(rootDir, value) {
	const counterPath = resolve(rootDir, COUNTER_FILE);
	try {
		writeFileSync(counterPath, String(value), "utf-8");
	} catch {
		// Read-only filesystem — abaikan
	}
}

/**
 * Baca counter tanpa increment. Dipakai oleh getBuildMetadata()
 * dan write-version-manifest.mjs.
 */
function readBuildCounter(rootDir) {
	return readCounterValue(rootDir);
}

/**
 * Increment counter file untuk build VPS/local.
 * Hanya dipanggil SEKALI per build, dari update-version.mjs.
 */
export function incrementBuildCounter(rootDir) {
	// Di VPS / local: increment counter file (persistent)
	const current = readCounterValue(rootDir);
	const next = current + 1;
	writeCounterValue(rootDir, next);
	return current;
}

export function getBuildMetadata(rootDir) {
	const envCommitHash = getEnvCommitHash();
	const gitCommitHash = normalizeCommit(runCommand(rootDir, "git rev-parse --short HEAD", ""));
	const commitHash = envCommitHash || gitCommitHash || "local";
	const commitMessage = runCommand(rootDir, "git log -1 --pretty=%s", "");
	const buildDate = new Date().toISOString().split("T")[0];
	const commitCount = runCommand(rootDir, "git rev-list --count HEAD", "0");
	const buildCounter = readBuildCounter(rootDir);

	// Versi: {major}.{minor}.{buildCounter}
	// Contoh: 0.2.1, 0.2.2 — patch number = sequential build counter
	// Clean semver, tanpa hash. Auto-increment tiap build.
	const [major, minor] = getBaseVersion(rootDir).split(".");
	const version = `${major}.${minor}.${buildCounter}`;

	return {
		version,
		commitHash,
		commitMessage,
		buildDate,
		commitCount,
		buildCounter,
		generatedAt: new Date().toISOString(),
	};
}
