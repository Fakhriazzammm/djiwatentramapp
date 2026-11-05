import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const domains = {
  admin: "admin.djiwatentram.web.id", customer: "djiwatentram.web.id",
  pos: "pos.djiwatentram.web.id", karyawan: "karyawan.djiwatentram.web.id", djiwapay: "djiwapay.web.id",
};
export function publishArtifact(root, app, source) {
  if (!Object.hasOwn(domains, app)) throw new Error("Unknown app");
  source = resolve(source);
  const live = join(root, "apps", app, "dist");
  if (source === resolve(live) || source.startsWith(resolve(live) + "/")) throw new Error("Artifact must be separate from live dist");
  const files = [];
  function inspect(dir, relative = "") {
    for (const name of readdirSync(dir)) {
      const rel = join(relative, name); const path = join(dir, name); const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Artifact symlinks are not allowed");
      if (stat.isDirectory()) inspect(path, rel);
      else if (stat.isFile()) files.push(rel);
      else throw new Error("Artifact contains non-regular files");
    }
  }
  inspect(source);
  const metadata = JSON.parse(readFileSync(join(source, ".djiwa-artifact.json"), "utf8"));
  const version = JSON.parse(readFileSync(join(source, "version.json"), "utf8"));
  if (metadata.app !== app || !/^[a-f0-9]{40}$/.test(metadata.commit)
    || !/^[a-f0-9]{7,40}$/.test(version.commitHash ?? "") || !metadata.commit.startsWith(version.commitHash)) {
    throw new Error("Artifact app or version does not match its source commit");
  }
  const html = readFileSync(join(source, "index.html"), "utf8");
  const references = [...html.matchAll(/(?:src|href)=["']\/?(assets\/[^"'?#]+)(?:[?#][^"']*)?["']/g)];
  if (!references.length || references.some(match => !files.includes(match[1]))) throw new Error("Missing entry assets");
  if (app === "admin") {
    const js = files.filter(file => file.endsWith(".js")).map(file => readFileSync(join(source, file), "utf8")).join("\n");
    for (const marker of ["/admin/kol", "/admin/community", "/admin/customers", "admin-protected-read"]) {
      if (!js.includes(marker)) throw new Error(`Invalid Admin artifact: ${marker}`);
    }
  }
  const appDir = join(root, "apps", app);
  const lock = join(appDir, ".publish-lock");
  mkdirSync(lock);
  const backup = join(appDir, ".release-backups", `${Date.now()}-${metadata.commit.slice(0, 7)}`);
  try {
    if (existsSync(live)) cpSync(live, backup, { recursive: true });
    mkdirSync(live, { recursive: true });
    // Preserve old hashed assets for already-open clients; publish entry last.
    for (const file of files.filter(file => file !== "index.html")) {
      const target = join(live, file);
      mkdirSync(dirname(target), { recursive: true });
      const temp = `${target}.deploy-${process.pid}`;
      cpSync(join(source, file), temp);
      renameSync(temp, target);
    }
    const nextIndex = join(live, `.index-${process.pid}.html`);
    writeFileSync(nextIndex, html);
    renameSync(nextIndex, join(live, "index.html"));
    return backup;
  } catch (error) {
    if (existsSync(backup)) cpSync(backup, live, { recursive: true });
    throw error;
  } finally { rmdirSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [app, artifact] = process.argv.slice(2);
  if (!artifact) throw new Error("Usage: node scripts/publish-artifact.mjs <app> <artifact-dir>");
  const root = resolve(import.meta.dirname, "..");
  if (root !== "/opt/djiwatentramapp") throw new Error("Publish only from canonical /opt/djiwatentramapp on djiwa-vps");
  console.log(`Backup: ${publishArtifact(root, app, artifact)}`);
  console.log(`Verify https://${domains[app]}/version.json before declaring deployment complete`);
}
