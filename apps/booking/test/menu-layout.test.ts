import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../..", "..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("booking menu card layout", () => {
  test("keeps a stable media slot when an image is missing or fails", () => {
    const source = read("apps/booking/src/main.tsx");
    const styles = read("apps/booking/src/index.css");

    expect(source).toContain("product-media");
    expect(source).not.toContain("style.display = \"none\"");
    expect(styles).toContain(".product-media");
  });
});
