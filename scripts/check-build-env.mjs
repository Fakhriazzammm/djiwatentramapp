#!/usr/bin/env node
/**
 * Build-time guard against shipping an app without its public Supabase config.
 *
 * Why: `vite build` exits 0 even when `VITE_SUPABASE_URL` / the publishable key
 * are absent. Vite inlines `undefined`, the auth module throws during
 * initialization, and the deployed SPA renders a blank white screen. This has
 * happened twice in production (a worktree build without `apps/<app>/.env`),
 * and both times the build looked successful.
 *
 * Two modes:
 *   node ../../scripts/check-build-env.mjs            -> pre-build check (npm script prefix)
 *   node ../../scripts/check-build-env.mjs --dist dist -> post-build check on the emitted bundle
 *
 * Bypass (not recommended): SKIP_BUILD_ENV_CHECK=1
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const BYPASS = String(process.env.SKIP_BUILD_ENV_CHECK ?? "").trim() === "1";
const appDir = process.cwd();
const distArgIndex = process.argv.indexOf("--dist");
const distDir = distArgIndex >= 0 ? resolve(appDir, process.argv[distArgIndex + 1] ?? "dist") : null;

const URL_KEY = "VITE_SUPABASE_URL";
const KEY_NAMES = ["VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"];
const CRASH_MARKER = "Supabase client key is not configured";
const SOURCE_ENV_NAMES = [URL_KEY, ...KEY_NAMES];

function appLabel() {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
    return pkg.name || appDir;
  } catch {
    return appDir;
  }
}

/** Parse a dotenv-style file without extra dependencies (tolerates BOM/quotes/export). */
function parseEnvFile(path) {
  const values = {};
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return values;
  }
  for (const line of raw.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

/** Vite build mode is "production" by default; process.env wins over files. */
const ENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];

function resolveEnvValue(name) {
  const fromProcess = String(process.env[name] ?? "").trim();
  if (fromProcess) return fromProcess;
  for (const file of ENV_FILES) {
    const value = String(parseEnvFile(join(appDir, file))[name] ?? "").trim();
    if (value) return value;
  }
  return "";
}

/** The app needs Supabase public config when its own source references it. */
function appNeedsSupabaseConfig() {
  const srcDirs = ["src", "app"].map((dir) => join(appDir, dir)).filter((dir) => existsSync(dir));
  if (srcDirs.length === 0) return false;
  const queue = [...srcDirs];
  while (queue.length > 0) {
    const current = queue.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        queue.push(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mts|cts)$/.test(entry.name)) continue;
      let content = "";
      try {
        content = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      if (SOURCE_ENV_NAMES.some((name) => content.includes(name))) return true;
    }
  }
  return false;
}

function resolveKeyValue() {
  for (const name of KEY_NAMES) {
    const value = resolveEnvValue(name);
    if (value) return { name, value };
  }
  return { name: KEY_NAMES[0], value: "" };
}

function fail(title, details) {
  console.error("");
  console.error(`\u2716 ${appLabel()}: ${title}`);
  for (const line of details) console.error(`   ${line}`);
  console.error("");
  process.exit(1);
}

if (BYPASS) {
  console.log(`\u26a0 check-build-env: skipped for ${appLabel()} (SKIP_BUILD_ENV_CHECK=1)`);
  process.exit(0);
}

const needed = appNeedsSupabaseConfig();
const urlValue = resolveEnvValue(URL_KEY);
const key = resolveKeyValue();

if (!needed) {
  console.log(`\u2713 check-build-env: no public Supabase config required by ${appLabel()}`);
  process.exit(0);
}

if (distDir === null) {
  // Pre-build: refuse to start a build that would ship a blank app.
  const missing = [];
  if (!urlValue) missing.push(URL_KEY);
  if (!key.value) missing.push(KEY_NAMES.join(" atau "));
  if (missing.length > 0) {
    fail("build diblokir karena konfigurasi publik Supabase tidak tersedia.", [
      `Tidak ditemukan: ${missing.join(", ")}`,
      `Sumber yang dicek: process.env, ${ENV_FILES.map((file) => join(appDir, file)).join(", ")}`,
      "Tanpa nilai ini Vite tetap exit 0, tetapi bundle yang di-deploy blank putih di browser.",
      "Perbaikan: sediakan file .env app (mis. salin dari .env.example) atau export variabelnya sebelum build.",
      "Bypass (tidak disarankan): SKIP_BUILD_ENV_CHECK=1",
    ]);
  }
  console.log(`\u2713 check-build-env: ${appLabel()} has ${URL_KEY} and ${key.name}`);
  process.exit(0);
}

// Post-build: prove the emitted bundle actually carries the values.
if (!existsSync(join(distDir, "index.html"))) {
  fail(`dist tidak ditemukan di ${distDir}.`, ["Jalankan `vite build` sebelum verifikasi dist."]);
}

function collectJsFiles(dir, acc = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(full, acc);
    else if (entry.name.endsWith(".js") && statSync(full).isFile()) acc.push(full);
  }
  return acc;
}

const bundleFiles = collectJsFiles(join(distDir, "assets"));
const bundleText = bundleFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const hasValue = (value) => value.length > 0 && bundleText.includes(value);

if (!hasValue(urlValue) || !hasValue(key.value)) {
  fail("bundle hasil build tidak memuat konfigurasi publik Supabase.", [
    `nilai env terbaca: ${URL_KEY}=${urlValue ? "ada" : "hilang"}, ${key.name}=${key.value ? "ada" : "hilang"}`,
    `nilai env ada di bundle: ${URL_KEY}=${hasValue(urlValue) ? "ya" : "tidak"}, ${key.name}=${hasValue(key.value) ? "ya" : "tidak"}`,
    `Dist: ${distDir}`,
    "Deploy bundle ini akan menghasilkan app blank putih. Jangan dipublikasikan.",
  ]);
}
if (bundleText.includes(CRASH_MARKER)) {
  fail("bundle hasil build memuat jalur error 'Supabase client key is not configured'.", [
    "Artinya konfigurasi publik tidak ter-inline saat build.",
    "Jangan deploy bundle ini; build ulang dengan .env app yang benar.",
  ]);
}

console.log(`\u2713 check-build-env: ${appLabel()} bundle memuat konfigurasi publik Supabase (${bundleFiles.length} file js)`);
