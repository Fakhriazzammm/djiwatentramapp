import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const app = process.argv[2];
if (!app) {
  console.error("Usage: node scripts/verify-public-env.mjs <app>");
  process.exit(2);
}

const keys = new Map();
for (const file of [join(".env"), join(`apps/${app}/.env`), join(`apps/${app}/.env.local`)]) {
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
if (missing.length) {
  console.error(`[env-guard] ${app} build blocked; missing public env: ${missing.join(", ")}`);
  console.error("[env-guard] Values are intentionally not printed.");
  process.exit(1);
}
console.log(`[env-guard] ${app}: required public Supabase env present`);
