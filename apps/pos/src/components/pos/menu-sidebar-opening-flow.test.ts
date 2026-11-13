import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./menu-sidebar.tsx", import.meta.url), "utf8");
const flow = readFileSync(new URL("../pos-ios/open-shift-flow.tsx", import.meta.url), "utf8");

describe("POS opening shift UX contract", () => {
	it("keeps the four-step flow and one active opening state", () => {
		expect(flow).toContain('"Data"');
		expect(flow).toContain('"Review"');
		expect(flow).toContain('"Checklist"');
		expect(flow).toContain("Shift siap digunakan");
		expect(source).toContain("const [startStep, setStartStep]");
	});

	it("supports fast input, team search, draft recovery, and a success handoff", () => {
		expect(source).toContain("SHIFT_OPENING_DRAFT_KEY");
		expect(flow).toContain("Cari anggota tim");
		expect(flow).toContain("Pilih semua");
		expect(flow).toContain("Kesiapan operasional");
		expect(flow).toContain("Centang semua");
		expect(flow).toContain("Masuk ke kasir");
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
