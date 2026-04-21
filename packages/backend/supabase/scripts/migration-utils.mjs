import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..", "..");

const migrationDirectories = [
  path.resolve(repoRoot, "packages", "backend", "supabase", "migrations"),
  path.resolve(repoRoot, "supabase", "migrations"),
];

export async function resolveMigrationPath(fileName) {
  for (const migrationDir of migrationDirectories) {
    const candidate = path.resolve(migrationDir, fileName);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate path.
    }
  }

  throw new Error(
    `Migration SQL file not found: ${fileName}. Checked: ${migrationDirectories.join(
      ", "
    )}`
  );
}
