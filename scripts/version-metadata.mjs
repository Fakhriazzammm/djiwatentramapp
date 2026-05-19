import { execSync } from "node:child_process";

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

export function getBuildMetadata(rootDir) {
	const envCommitHash = getEnvCommitHash();
	const gitCommitHash = normalizeCommit(runCommand(rootDir, "git rev-parse --short HEAD", ""));
	const commitHash = envCommitHash || gitCommitHash || "local";
	const buildDate = new Date().toISOString().split("T")[0];
	const commitCount = runCommand(rootDir, "git rev-list --count HEAD", "0");
	const commitCountNum = parseInt(commitCount) || 0;

	// Auto-derive major.minor dari commit count.
	// Setiap 500 commit → minor naik 1.
	// Dengan 1140 commit → minor = 2 → 0.2.xxx
	const major = "0";
	const minor = String(Math.floor(commitCountNum / 500));

	const version = `${major}.${minor}.${commitCount}-${commitHash}`;

	return {
		version,
		commitHash,
		buildDate,
		commitCount,
		generatedAt: new Date().toISOString(),
	};
}
