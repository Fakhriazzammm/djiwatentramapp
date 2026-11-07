#!/usr/bin/env node
// Pull-only auto deploy for the Djiwa Tentram VPS. NEVER builds and needs no token.
//
// A separate build machine runs scripts/ship-artifacts.sh, which builds origin/main and uploads
// <app>-<sha>/ into the incoming directory. This script (run by djiwa-artifact-deploy.timer)
// asks GitHub which commit main points at (public `git ls-remote`, no credentials) and publishes
// the matching artifact when it is not live yet. An artifact for any other commit is never used,
// so unpushed or stale builds cannot reach production.
//
//   node scripts/artifact-autodeploy.mjs            # deploy what is new
//   node scripts/artifact-autodeploy.mjs --check    # print state, change nothing
//   node scripts/artifact-autodeploy.mjs --force    # republish the current commit
//
// Env (optional, /etc/djiwatentramapp/artifact-autodeploy.env):
//   GITHUB_REPO default Fakhriazzammm/djiwatentramapp   DEPLOY_BRANCH default main
//   DEPLOY_APPS default admin,customer,pos,karyawan,djiwapay
//   DEPLOY_ROOT default /opt/djiwatentramapp            DEPLOY_STATE default /var/lib/djiwa-autodeploy
import { chownSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { domains, publishArtifact } from "./publish-artifact.mjs";

export const artifactName = (app, sha) => `${app}-${sha}`;

/** Pure decision: should this app be deployed now? */
export function decide({ sha, deployedSha, ready, force = false }) {
  if (!ready) return { deploy: false, reason: "artifact untuk commit ini belum diunggah" };
  if (sha === deployedSha && !force) return { deploy: false, reason: "sudah live" };
  return { deploy: true, reason: `${deployedSha ? deployedSha.slice(0, 7) : "none"} -> ${sha.slice(0, 7)}` };
}

function config(env = process.env) {
  const state = env.DEPLOY_STATE ?? "/var/lib/djiwa-autodeploy";
  const cfg = {
    repo: env.GITHUB_REPO ?? "Fakhriazzammm/djiwatentramapp",
    branch: env.DEPLOY_BRANCH ?? "main",
    apps: (env.DEPLOY_APPS ?? "admin,customer,pos,karyawan,djiwapay").split(",").map(s => s.trim()).filter(Boolean),
    root: env.DEPLOY_ROOT ?? "/opt/djiwatentramapp",
    state,
    incoming: join(state, "incoming"),
  };
  for (const app of cfg.apps) if (!Object.hasOwn(domains, app)) throw new Error(`Unknown app: ${app}`);
  return cfg;
}

function remoteHead(cfg) {
  const out = spawnSync("git", ["ls-remote", `https://github.com/${cfg.repo}.git`, `refs/heads/${cfg.branch}`], { encoding: "utf8", timeout: 30000 });
  const sha = out.stdout?.split(/\s+/)[0] ?? "";
  if (out.status !== 0 || !/^[a-f0-9]{40}$/.test(sha)) throw new Error(`git ls-remote gagal: ${out.stderr || "sha tidak valid"}`);
  return sha;
}

function chownTree(path, uid, gid) {
  chownSync(path, uid, gid);
  if (!lstatSync(path).isDirectory()) return;
  for (const name of readdirSync(path)) chownTree(join(path, name), uid, gid);
}

async function liveCommit(app) {
  const res = await fetch(`https://${domains[app]}/version.json`, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`version.json HTTP ${res.status}`);
  return (await res.json()).commitHash ?? "";
}

async function deployApp(cfg, app, sha, dir) {
  const live = join(cfg.root, "apps", app, "dist");
  const owner = existsSync(live) ? statSync(live) : null;
  let backup = null;
  try {
    backup = publishArtifact(cfg.root, app, dir);
    if (owner) chownTree(live, owner.uid, owner.gid);
    const served = await liveCommit(app);
    if (!served || !sha.startsWith(served)) throw new Error(`version.json menyajikan ${served || "kosong"}, bukan ${sha.slice(0, 7)}`);
  } catch (error) {
    if (backup && existsSync(backup)) {
      cpSync(backup, live, { recursive: true });
      if (owner) chownTree(live, owner.uid, owner.gid);
      console.error(`ROLLBACK ${app} ke ${backup}`);
    }
    throw error;
  }
}

/** Keep the incoming dir small: drop this app's artifacts for other commits and abandoned uploads. */
function cleanup(cfg, app, keepSha) {
  if (!existsSync(cfg.incoming)) return;
  for (const name of readdirSync(cfg.incoming)) {
    if (!name.startsWith(`${app}-`) || name === artifactName(app, keepSha)) continue;
    rmSync(join(cfg.incoming, name), { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const cfg = config(env);
  const check = argv.includes("--check");
  const force = argv.includes("--force");
  const sha = remoteHead(cfg);
  mkdirSync(cfg.incoming, { recursive: true });
  let failed = 0;
  for (const app of cfg.apps) {
    const stateFile = join(cfg.state, `${app}.sha`);
    const deployedSha = existsSync(stateFile) ? readFileSync(stateFile, "utf8").trim() : null;
    const dir = join(cfg.incoming, artifactName(app, sha));
    const verdict = decide({ sha, deployedSha, ready: existsSync(join(dir, ".djiwa-artifact.json")), force });
    console.log(`${app}: ${verdict.deploy ? "DEPLOY" : "skip"} (${verdict.reason})`);
    if (check || !verdict.deploy) continue;
    try {
      await deployApp(cfg, app, sha, dir);
      writeFileSync(stateFile, sha);
      cleanup(cfg, app, sha);
      console.log(`${app}: OK ${sha.slice(0, 7)}`);
    } catch (error) {
      failed += 1;
      console.error(`${app}: GAGAL - ${error.message}`);
    }
  }
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().then(code => process.exit(code), error => { console.error(error.message); process.exit(1); });
}
