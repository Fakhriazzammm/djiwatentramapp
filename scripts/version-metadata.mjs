import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
		normalizeCommit(process.env.VERCEL_GIT_COMMIT_SHA) ||
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

export function getBuildMetadata(rootDir) {
	const envCommitHash = getEnvCommitHash();
	const gitCommitHash = normalizeCommit(runCommand(rootDir, "git rev-parse --short HEAD", ""));
	const commitHash = envCommitHash || gitCommitHash || "local";
	const buildDate = new Date().toISOString().split("T")[0];
	const commitCount = runCommand(rootDir, "git rev-list --count HEAD", "0");

	// Versi: {major}.{minor}.{commitCount}-{commitHash}
	// Contoh: 0.2.1479-0388a32 — patch number = total commit, suffix = commit hash
	// Commit hash memastikan tiap deploy punya versi unik (Vercel shallow clone bikin commitCount stabil)
	const [major, minor] = getBaseVersion(rootDir).split(".");
	const version = `${major}.${minor}.${commitCount}-${commitHash}`;

	return {
		version,
		commitHash,
		buildDate,
		commitCount,
		generatedAt: new Date().toISOString(),
	};
}
