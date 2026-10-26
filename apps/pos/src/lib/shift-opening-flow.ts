export const SHIFT_OPENING_STEPS = ["Data Shift", "Review", "Checklist", "Selesai"] as const;

export type ShiftOpeningDraft = {
	cashierName: string;
	shiftName: string;
	amount: string;
	teamMembers: string[];
	notes: string;
};

export function validateShiftOpening(input: Pick<ShiftOpeningDraft, "cashierName" | "shiftName" | "amount">): string | null {
	if (!input.cashierName.trim()) return "Pilih kasir terlebih dahulu";
	if (!input.shiftName.trim()) return "Pilih shift terlebih dahulu";
	if (!input.amount.trim()) return "Isi modal awal terlebih dahulu";
	const amount = Number(input.amount);
	if (!Number.isFinite(amount) || amount < 0) return "Modal awal harus 0 atau lebih";
	return null;
}

export function formatShiftOpeningCurrency(value: string): string {
	const amount = Number(value || 0);
	return `Rp ${Number.isFinite(amount) ? Math.max(0, amount).toLocaleString("id-ID") : "0"}`;
}

export function serializeShiftOpeningDraft(draft: ShiftOpeningDraft): string {
	return JSON.stringify({
		cashierName: draft.cashierName,
		shiftName: draft.shiftName,
		amount: draft.amount,
		teamMembers: draft.teamMembers,
		notes: draft.notes,
	});
}

export function restoreShiftOpeningDraft(value: string | null): ShiftOpeningDraft | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Partial<ShiftOpeningDraft>;
		if (
			typeof parsed.cashierName !== "string" ||
			typeof parsed.shiftName !== "string" ||
			typeof parsed.amount !== "string" ||
			!Array.isArray(parsed.teamMembers) ||
			!parsed.teamMembers.every((member) => typeof member === "string") ||
			typeof parsed.notes !== "string"
		) return null;
		return {
			cashierName: parsed.cashierName,
			shiftName: parsed.shiftName,
			amount: parsed.amount,
			teamMembers: parsed.teamMembers,
			notes: parsed.notes,
		};
	} catch {
		return null;
	}
}
