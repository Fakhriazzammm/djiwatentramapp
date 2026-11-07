#!/usr/bin/env node
// Pull-only auto deploy for the Djiwa Tentram VPS. NEVER builds: CI builds the artifact
// (.github/workflows/deploy-vps.yml), this script only downloads, verifies and publishes it.
//
// Run by djiwa-artifact-deploy.timer. One cheap API call per tick; work only happens when the
// newest commit on <branch> has a finished artifact that is not live yet.
//
//   node scripts/artifact-autodeploy.mjs            # deploy what is new
//   node scripts/artifact-autodeploy.mjs --check    # print state, change nothing
//   node scripts/artifact-autodeploy.mjs --force    # redeploy current commit
//
// Config (env, normally from /etc/djiwatentramapp/artifact-autodeploy.env, mode 600):
//   GITHUB_TOKEN   fine-grained PAT, read-only "Actions" + "Contents" on this repo (required)
//   GITHUB_REPO    default Fakhriazzammm/djiwatentramapp
//   DEPLOY_BRANCH  default main
//   DEPLOY_APPS    default admin,customer,pos,karyawan,djiwapay
//   DEPLOY_ROOT    default /opt/djiwatentramapp
//   DEPLOY_STATE   default /var/lib/djiwa-autodeploy
import { chownSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { domains, publishArtifact } from "./publish-artifact.mjs";

export const artifactName = (app, sha) => `${app}-${sha}`;

/** Pure decision: should this app be deployed now? */
export function decide({ sha, deployedSha, artifact, force = false }) {
  if (!artifact) return { deploy: false, reason: "artifact belum ada (CI belum selesai atau gagal)" };
  if (artifact.expired) return { deploy: false, reason: "artifact kedaluwarsa" };
  if (sha === deployedSha && !force) return { deploy: false, reason: "sudah live" };
  return { deploy: true, reason: `${deployedSha ?? "none"} -> ${sha}` };
}

function config(env = process.env) {
  const cfg = {
    token: env.GITHUB_TOKEN ?? "",
    repo: env.GITHUB_REPO ?? "Fakhriazzammm/djiwatentramapp",
    branch: env.DEPLOY_BRANCH ?? "main",
    apps: (env.DEPLOY_APPS ?? "admin,customer,pos,karyawan,djiwapay").split(",").map(s => s.trim()).filter(Boolean),
    root: env.DEPLOY_ROOT ?? "/opt/djiwatentramapp",
    state: env.DEPLOY_STATE ?? "/var/lib/djiwa-autodeploy",
  };
  for (const app of cfg.apps) if (!Object.hasOwn(domains, app)) throw new Error(`Unknown app: ${app}`);
  return cfg;
}

async function gh(cfg, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "djiwa-artifact-autodeploy" },
  });
  if (!res.ok) throw new Error(`GitHub ${path} -> HTTP ${res.status}`);
  return res;
}

async function findArtifact(cfg, app, sha) {
  const data = await (await gh(cfg, `/actions/artifacts?name=${encodeURIComponent(artifactName(app, sha))}&per_page=1`)).json();
  return data.artifacts?.[0] ?? null;
}

async function download(cfg, artifact, dest) {
  const res = await gh(cfg, `/actions/artifacts/${artifact.id}/zip`);
  const zip = join(dest, "artifact.zip");
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const out = join(dest, "out");
  mkdirSync(out);
  const unzip = spawnSync("unzip", ["-q", zip, "-d", out], { encoding: "utf8" });
  if (unzip.status !== 0) throw new Error(`unzip gagal: ${unzip.stderr}`);
  rmSync(zip);
  return out;
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

async function deployApp(cfg, app, sha, artifact) {
  const work = mkdtempSync(join(tmpdir(), `djiwa-${app}-`));
  const live = join(cfg.root, "apps", app, "dist");
  const owner = existsSync(live) ? statSync(live) : null;
  let backup = null;
  try {
    const dir = await download(cfg, artifact, work);
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
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const cfg = config(env);
  if (!cfg.token) throw new Error("GITHUB_TOKEN belum diatur");
  const check = argv.includes("--check");
  const force = argv.includes("--force");
  const sha = (await (await gh(cfg, `/commits/${cfg.branch}`)).json()).sha;
  mkdirSync(cfg.state, { recursive: true });
  let failed = 0;
  for (const app of cfg.apps) {
    const stateFile = join(cfg.state, `${app}.sha`);
    const deployedSha = existsSync(stateFile) ? readFileSync(stateFile, "utf8").trim() : null;
    const artifact = await findArtifact(cfg, app, sha);
    const verdict = decide({ sha, deployedSha, artifact, force });
    console.log(`${app}: ${verdict.deploy ? "DEPLOY" : "skip"} (${verdict.reason})`);
    if (check || !verdict.deploy) continue;
    try {
      await deployApp(cfg, app, sha, artifact);
      writeFileSync(stateFile, sha);
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
