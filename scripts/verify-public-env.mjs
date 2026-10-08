import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const requested = process.argv[2];
const appDirs = readdirSync("apps", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "auth-server")
  .map((entry) => entry.name);

function usesSupabase(app) {
  const root = join("apps", app, "src");
  if (!existsSync(root)) return false;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        const source = readFileSync(path, "utf8");
        if (/createClient|@supabase\/supabase-js|VITE_SUPABASE/.test(source)) return true;
      }
    }
  }
  return false;
}

function check(app) {
  const keys = new Map();
  for (const file of [".env", join(`apps/${app}/.env`), join(`apps/${app}/.env.local`)]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !keys.has(match[1])) keys.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
    }
  }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VITE_") && !keys.has(key)) keys.set(key, process.env[key] ?? "");
  }
  const missing = [];
  if (!keys.get("VITE_SUPABASE_URL")) missing.push("VITE_SUPABASE_URL");
  if (!keys.get("VITE_SUPABASE_PUBLISHABLE_KEY") && !keys.get("VITE_SUPABASE_ANON_KEY")) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY");
  if (missing.length) return missing;
  console.log(`[env-guard] ${app}: required public Supabase env present`);
  return [];
}

const apps = requested === "--all" ? appDirs.filter(usesSupabase) : [requested];
if (!apps.length || apps.includes(undefined)) {
  console.error("Usage: node scripts/verify-public-env.mjs <app|--all>");
  process.exit(2);
}
const failures = [];
for (const app of apps) {
  const missing = check(app);
  if (missing.length) failures.push(`${app}: ${missing.join(", ")}`);
}
if (failures.length) {
  console.error("[env-guard] build/deploy blocked; missing public env:");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("[env-guard] Values are intentionally not printed.");
  process.exit(1);
}
