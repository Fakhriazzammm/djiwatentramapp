import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const theme = readFileSync(resolve(import.meta.dir, "theme.css"), "utf8");

test("shared theme keeps form controls free from the dark global focus outline", () => {
	const genericFocusRule = theme.match(/\*:\s*focus-visible\s*\{([\s\S]*?)\}/)?.[1] ?? "";
	expect(genericFocusRule).not.toContain("outline: 2px solid var(--foreground");
	expect(theme).toContain(":where(input, textarea, select):focus-visible");
	expect(theme).toContain("outline: none");
});

test("shared theme still exposes a visible focus treatment for non-form controls", () => {
	expect(theme).toContain(":where(button, a, summary, [role=\"button\"]):focus-visible");
});
