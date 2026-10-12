#!/usr/bin/env node
/**
 * Post-deploy verifier: proves a published webroot is not the "blank white app"
 * case, independently of which branch or worktree produced the build.
 *
 * Usage: node scripts/verify-deployed-env.mjs <webroot> [<webroot> ...]
 *
 * Checks per webroot:
 *   1. index.html exists and every referenced /assets/*.js file exists on disk
 *      (a missing hashed chunk means a stale shell / mixed deploy)
 *   2. the referenced bundle carries Supabase key material (env was inlined)
 *   3. the referenced bundle does not carry the module-init crash path
 *      "Supabase client key is not configured"
 *
 * Exit code 0 only when no webroot fails. Warnings (undeterminable app) do not
 * fail the run, but are printed so a human can decide.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const CRASH_MARKER = "Supabase client key is not configured";
const KEY_PATTERNS = [/eyJhbGciOi/, /sb_publishable_/, /sbp_[A-Za-z0-9]{10,}/];

const roots = process.argv.slice(2).map((value) => resolve(value));
if (roots.length === 0) {
  console.error("usage: node scripts/verify-deployed-env.mjs <webroot> [<webroot> ...]");
  process.exit(2);
}

let failures = 0;

for (const root of roots) {
  const label = root;
  const indexPath = join(root, "index.html");
  if (!existsSync(indexPath)) {
    console.error(`\u2716 ${label}: index.html tidak ditemukan`);
    failures += 1;
    continue;
  }

  const html = readFileSync(indexPath, "utf8");
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((match) => match[1]);
  const entries = [...new Set(assets)];
  if (entries.length === 0) {
    console.error(`\u2716 ${label}: index.html tidak mereferensikan bundle /assets/*.js`);
    failures += 1;
    continue;
  }

  let version = "";
  try {
    const manifest = JSON.parse(readFileSync(join(root, "version.json"), "utf8"));
    version = `${manifest.version ?? "?"} / ${manifest.commitHash ?? "?"}`;
  } catch {
    version = "n/a";
  }

  let bundleText = "";
  const missing = [];
  for (const entry of entries) {
    const file = join(root, entry.replace(/^\//, ""));
    if (!existsSync(file) || !statSync(file).isFile()) {
      missing.push(entry);
      continue;
    }
    bundleText += readFileSync(file, "utf8");
  }

  if (missing.length > 0) {
    console.error(`\u2716 ${label} [${version}]: bundle yang direferensikan tidak ada di webroot -> ${missing.join(", ")}`);
    failures += 1;
    continue;
  }

  if (bundleText.includes(CRASH_MARKER)) {
    console.error(`\u2716 ${label} [${version}]: bundle memuat jalur error "${CRASH_MARKER}" (app akan blank putih)`);
    failures += 1;
    continue;
  }

  const hasKey = KEY_PATTERNS.some((pattern) => pattern.test(bundleText));
  if (!hasKey) {
    console.warn(`\u26a0 ${label} [${version}]: tidak ada materi kunci Supabase di bundle - pastikan app ini memang tidak butuh konfigurasi Supabase`);
    continue;
  }

  console.log(`\u2713 ${label} [${version}]: bundle memuat konfigurasi Supabase, tidak ada jalur error env (${entries.length} entry js)`);
}

if (failures > 0) {
  console.error(`\n${failures} webroot gagal verifikasi. Jangan anggap deploy sukses.`);
  process.exit(1);
}
console.log("\nSemua webroot lolos verifikasi env.");
