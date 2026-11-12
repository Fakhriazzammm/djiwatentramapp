import { describe, expect, test } from "bun:test";
import { repackCountForKg } from "./repack-count";

describe("repackCountForKg", () => {
	test("shows package count from noodle weight even before repack is selected", () => {
		expect(repackCountForKg(1)).toBe(10);
		expect(repackCountForKg(1.5)).toBe(15);
	});
});
