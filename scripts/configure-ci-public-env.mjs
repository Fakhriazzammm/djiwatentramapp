// Transfer only browser-public configuration to GitHub Actions variables.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
const repo = "Fakhriazzammm/djiwatentramapp";
for (const app of ["admin", "karyawan"]) {
  const raw = parse(readFileSync(`/opt/djiwatentramapp/apps/${app}/.env`));
  const env = Object.fromEntries(Object.entries(raw).filter(([key]) => /^VITE_[A-Z0-9_]+$/.test(key) && key !== "VITE_ADMIN_SECRET"));
  if (app === "admin" && raw.VITE_ADMIN_SECRET) {
    const secret = spawnSync("gh", ["secret", "set", "LEGACY_ADMIN_BUILD_SECRET", "--repo", repo], { input: raw.VITE_ADMIN_SECRET, encoding: "utf8" });
    if (secret.status !== 0) throw new Error(secret.stderr);
  }
  if (app === "admin") env.VITE_VAPID_PUBLIC_KEY = parse(readFileSync("/opt/supabase-selfhost/.env")).VAPID_PUBLIC_KEY;
  for (const [key, value] of Object.entries(env)) {
    if (/SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY/.test(key)) throw new Error(`Refusing non-public field ${key}`);
    if (String(value).split(".").length === 3) {
      try { if (JSON.parse(Buffer.from(value.split(".")[1], "base64url")).role === "service_role") throw new Error("Privileged JWT rejected"); }
      catch (error) { if (error.message === "Privileged JWT rejected") throw error; }
    }
  }
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error(`Missing public Supabase configuration for ${app}`);
  const result = spawnSync("gh", ["variable", "set", `BUILD_ENV_${app}`, "--repo", repo], { input: JSON.stringify(env), encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  console.log(`Configured ${app} public fields: ${Object.keys(env).join(", ")}`);
}
