import { describe, expect, it } from "bun:test";
import { SITE_SETTINGS_ORDER } from "./site-settings-utils";

describe("site settings selection", () => {
	it("selects the newest settings record by creation time", () => {
		expect(SITE_SETTINGS_ORDER).toEqual({
			column: "creation_time",
			ascending: false,
			nullsFirst: false,
		});
	});
});
