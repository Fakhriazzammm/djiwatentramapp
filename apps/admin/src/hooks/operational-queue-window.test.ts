import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(import.meta.dir + "/use-hybrid-ops-data.ts", "utf8");

test("operational queue reads only the current WIB day", () => {
	expect(source).toContain("getWibDayRange");
	expect(source).toContain("gte: { createdAt: operationalWindow.start }");
	expect(source).toContain("lte: { createdAt: operationalWindow.end }");
	expect(source).toContain('.gte("created_at", new Date(operationalWindow.start).toISOString())');
	expect(source).toContain('.lte("created_at", new Date(operationalWindow.end).toISOString())');
});
