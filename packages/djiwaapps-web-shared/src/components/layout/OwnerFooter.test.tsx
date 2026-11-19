import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(import.meta.dir + "/OwnerFooter.tsx", "utf8");

test("OwnerFooter lets attribution wrap by whole segments instead of clipping", () => {
	const attribution = source.match(/owner-footer-attribution[\s\S]*?`}/)?.[0] ?? "";

	expect(attribution).toContain("flex-row");
	expect(attribution).toContain("flex-wrap");
	expect(attribution).not.toContain("overflow-x-auto");
	expect(attribution).not.toContain("flex-col");
	expect(source).toContain("Djiwa Tentram");
	expect(source).toContain("Zantara Technology");
});
