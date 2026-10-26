import { describe, expect, it } from "vitest";
import {
	SHIFT_OPENING_STEPS,
	formatShiftOpeningCurrency,
	restoreShiftOpeningDraft,
	serializeShiftOpeningDraft,
	validateShiftOpening,
} from "./shift-opening-flow";

describe("shift opening flow", () => {
	it("keeps the four-step opening journey explicit", () => {
		expect(SHIFT_OPENING_STEPS).toEqual(["Data Shift", "Review", "Checklist", "Selesai"]);
	});

	it("requires cashier, shift, and a non-negative numeric opening cash", () => {
		expect(validateShiftOpening({ cashierName: "", shiftName: "Pagi", amount: "100000" })).toBe("Pilih kasir terlebih dahulu");
		expect(validateShiftOpening({ cashierName: "Sari", shiftName: "", amount: "100000" })).toBe("Pilih shift terlebih dahulu");
		expect(validateShiftOpening({ cashierName: "Sari", shiftName: "Pagi", amount: "-1" })).toBe("Modal awal harus 0 atau lebih");
		expect(validateShiftOpening({ cashierName: "Sari", shiftName: "Pagi", amount: "" })).toBe("Isi modal awal terlebih dahulu");
		expect(validateShiftOpening({ cashierName: "Sari", shiftName: "Pagi", amount: "0" })).toBeNull();
	});

	it("formats opening cash for a fast, readable input", () => {
		expect(formatShiftOpeningCurrency("500000")).toBe("Rp 500.000");
		expect(formatShiftOpeningCurrency("0")).toBe("Rp 0");
		expect(formatShiftOpeningCurrency("" as string)).toBe("Rp 0");
	});

	it("round-trips only the opening draft fields", () => {
		const draft = {
			cashierName: "Sari",
			shiftName: "Pagi",
			amount: "500000",
			teamMembers: ["Budi"],
			notes: "Laci baru",
		};
		expect(restoreShiftOpeningDraft(serializeShiftOpeningDraft(draft))).toEqual(draft);
		expect(restoreShiftOpeningDraft("broken-json")).toBeNull();
	});
});
