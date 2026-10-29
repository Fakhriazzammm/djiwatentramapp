import { describe, expect, it } from "bun:test";
import { getAdminSplashStatus } from "./admin-splash";

describe("admin splash status", () => {
	it("shows the normal preparation message while loading", () => {
		expect(getAdminSplashStatus({ offline: false, stalled: false })).toBe(
			"Menyiapkan ruang kerja Djiwa Tentram",
		);
	});

	it("prioritizes the offline message", () => {
		expect(getAdminSplashStatus({ offline: true, stalled: true })).toContain(
			"offline",
		);
	});

	it("explains when loading is stalled", () => {
		expect(getAdminSplashStatus({ offline: false, stalled: true })).toContain(
			"Koneksi lambat",
		);
	});
});
