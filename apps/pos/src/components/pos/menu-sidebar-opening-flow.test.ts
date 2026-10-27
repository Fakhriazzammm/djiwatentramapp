import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./menu-sidebar.tsx", import.meta.url), "utf8");

describe("POS opening shift UX contract", () => {
	it("keeps the four-step flow and one active opening state", () => {
		expect(source).toContain("Data Shift");
		expect(source).toContain("Review");
		expect(source).toContain("Checklist");
		expect(source).toContain("Selesai");
		expect(source).toContain("const [startStep, setStartStep]");
	});

	it("supports fast input, team search, draft recovery, and a success handoff", () => {
		expect(source).toContain("SHIFT_OPENING_DRAFT_KEY");
		expect(source).toContain("Cari anggota tim");
		expect(source).toContain("Pilih semua");
		expect(source).toContain("Kesiapan operasional");
		expect(source).toContain("Tandai semua");
		expect(source).toContain("formatShiftOpeningCurrency");
		expect(source).toContain("Masuk ke Kasir");
	});

	it("refreshes shared shift status after opening a shift", () => {
		const startSuccess = source.indexOf('toast.success("Shift berhasil dimulai")');
		const refresh = source.indexOf("triggerHybridRefresh();", startSuccess);

		expect(startSuccess).toBeGreaterThan(-1);
		expect(refresh).toBeGreaterThan(startSuccess);
	});

	it("does not reintroduce keyboard shortcut UI", () => {
		expect(source).not.toContain("KEYBOARD SHORTCUT");
		expect(source).not.toContain("useMenuKeyboardNav");
	});
});
