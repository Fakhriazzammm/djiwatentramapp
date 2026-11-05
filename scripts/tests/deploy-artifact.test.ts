import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("artifact publishing rejects an invalid release without changing the live page", async () => {
  const root = mkdtempSync(join(tmpdir(), "djiwa-artifact-"));
  try {
    const live = join(root, "apps/admin/dist"); const artifact = join(root, "artifact");
    mkdirSync(live, { recursive: true }); mkdirSync(artifact);
    writeFileSync(join(live, "index.html"), "old live page");
    writeFileSync(join(artifact, "index.html"), "bad release");
    const { publishArtifact } = await import("../publish-artifact.mjs");
    expect(() => publishArtifact(root, "admin", artifact)).toThrow();
    expect(readFileSync(join(live, "index.html"), "utf8")).toBe("old live page");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("artifact publishing preserves old assets and a rollback copy", async () => {
  const root = mkdtempSync(join(tmpdir(), "djiwa-artifact-"));
  try {
    const live = join(root, "apps/customer/dist"); const artifact = join(root, "artifact");
    mkdirSync(join(live, "assets"), { recursive: true }); mkdirSync(join(artifact, "assets"), { recursive: true });
    writeFileSync(join(live, "index.html"), "old live page");
    writeFileSync(join(live, "assets/old.js"), "old asset");
    writeFileSync(join(artifact, "assets/new.js"), "new asset");
    writeFileSync(join(artifact, "index.html"), '<script src="/assets/new.js"></script>');
    writeFileSync(join(artifact, "version.json"), JSON.stringify({ commitHash: "1234567" }));
    writeFileSync(join(artifact, ".djiwa-artifact.json"), JSON.stringify({ app: "customer", commit: "1234567890123456789012345678901234567890" }));
    const { publishArtifact } = await import("../publish-artifact.mjs");
    const backup = publishArtifact(root, "customer", artifact);
    expect(readFileSync(join(live, "assets/old.js"), "utf8")).toBe("old asset");
    expect(readFileSync(join(live, "index.html"), "utf8")).toContain("new.js");
    expect(readFileSync(join(backup, "index.html"), "utf8")).toBe("old live page");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
