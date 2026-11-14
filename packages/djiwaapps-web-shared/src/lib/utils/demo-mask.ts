// Demo mode masking utilities
// Layer 1: replaces actual numbers with "•••" in client viewer mode

let _isDemoMode = false;

export function setDemoMode(v: boolean) {
	_isDemoMode = v;
}

export function getDemoMode() {
	return _isDemoMode;
}

/**
 * Format number with demo mode masking.
 * In demo mode, returns "•••" instead of the actual number.
 */
export function fmt(
	n: number | null | undefined,
	opts?: { prefix?: string; suffix?: string }
): string {
	if (_isDemoMode) {
		return opts?.prefix ? `${opts.prefix} •••` : "•••";
	}
	if (n == null) return "-";
	return `${opts?.prefix || ""}${n.toLocaleString("id-ID")}${opts?.suffix || ""}`;
}

/**
 * Mask all digit sequences in a string with "•••".
 * Useful for mixed text like "Stok: 120 pcs" → "Stok: ••• pcs"
 */
export function maskNumbersInText(text: string): string {
	if (!_isDemoMode || !text) return text;
	return text.replace(/\d+(\.\d+)?/g, "•••");
}
