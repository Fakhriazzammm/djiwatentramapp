// ─── Unit hierarchy for auto-conversion ───────────────

type UnitGroup = "mass" | "volume" | "count";

const UNIT_HIERARCHY: Record<string, { group: UnitGroup; defaultFactor?: number }> = {
	kg: { group: "mass", defaultFactor: 1000 },
	gram: { group: "mass" },
	gr: { group: "mass" },
	g: { group: "mass" },
	liter: { group: "volume", defaultFactor: 1000 },
	l: { group: "volume", defaultFactor: 1000 },
	ml: { group: "volume" },
	dus: { group: "count" },
	karton: { group: "count" },
	box: { group: "count" },
	pack: { group: "count" },
	botol: { group: "count" },
	sachet: { group: "count" },
	toros: { group: "count" },
};

const SMALLEST_UNIT_LABEL: Record<UnitGroup, string> = {
	mass: "gram",
	volume: "ml",
	count: "pcs",
};

function normalizeUnit(value?: string | null): string {
	return (value || "").trim().toLowerCase();
}

/**
 * Parse unitConversionsText format like "gram:1000" or "gram=1000;pcs=24"
 */
export function parseUnitConversionsText(input?: string | null): Array<{ unit: string; factor: number }> | undefined {
	if (!input) return undefined;
	const rows = input
		.split(/[\n,;]+/)
		.map((chunk) => chunk.trim())
		.filter(Boolean);

	const parsed: Array<{ unit: string; factor: number }> = [];
	for (const row of rows) {
		const [rawUnit, rawFactor] = row.split(/[:=]/).map((part) => part.trim());
		const factor = Number(rawFactor);
		if (!rawUnit || Number.isNaN(factor) || factor <= 0) {
			continue;
		}
		parsed.push({ unit: rawUnit.toLowerCase(), factor });
	}

	if (parsed.length === 0) return undefined;
	return parsed;
}

/**
 * Return { unit, factor } for the smallest display unit (gram/ml/pcs).
 * If the item already uses a small unit, factor = 1.
 * If the item uses a large unit (kg, dus, etc.), factor > 1 to convert.
 * Returns null when no unit info is available.
 */
export function getSmallestUnitInfo(item: {
	unit?: string | null;
	displayUnit?: string | null;
	conversionFactor?: number | null;
	unitConversionsText?: string | null;
}): { unit: string; factor: number } | null {
	const normUnit = normalizeUnit(item.unit);
	if (!normUnit) return null;

	const hierarchy = UNIT_HIERARCHY[normUnit];
	if (!hierarchy) return null;

	const smallestLabel = SMALLEST_UNIT_LABEL[hierarchy.group];

	// Already at smallest unit
	if (normUnit === smallestLabel) {
		return { unit: smallestLabel, factor: 1 };
	}

	let factor: number | null = null;

	// 1. Check unitConversionsText for explicit mapping to smallest unit
	const conversions = parseUnitConversionsText(item.unitConversionsText);
	if (conversions && conversions.length > 0) {
		const match = conversions.find((c) => normalizeUnit(c.unit) === smallestLabel);
		if (match && match.factor > 0) factor = match.factor;
	}

	// 2. Check legacy displayUnit + conversionFactor
	if (factor === null && item.displayUnit && item.conversionFactor && item.conversionFactor > 0) {
		if (normalizeUnit(item.displayUnit) === smallestLabel) {
			factor = item.conversionFactor;
		}
	}

	// 3. Fall back to default factor (1000 for kg→gram, liter→ml)
	if (factor === null && hierarchy.defaultFactor) {
		factor = hierarchy.defaultFactor;
	}

	if (!factor || factor <= 0) {
		// Can't determine conversion — return original unit without converting
		return { unit: normUnit, factor: 1 };
	}

	return { unit: smallestLabel, factor };
}

/**
 * Get just the smallest display unit label (gram/ml/pcs) for an inventory item.
 */
export function getSmallestUnitLabel(item: {
	unit?: string | null;
	displayUnit?: string | null;
	conversionFactor?: number | null;
	unitConversionsText?: string | null;
}): string {
	return getSmallestUnitInfo(item)?.unit ?? item?.unit ?? "";
}

/**
 * Convert an amount from the inventory's base unit to the smallest display unit.
 */
export function convertToSmallestUnit(
	amount: number | null | undefined,
	item: {
		unit?: string | null;
		displayUnit?: string | null;
		conversionFactor?: number | null;
		unitConversionsText?: string | null;
	}
): { amount: number; unit: string } | null {
	if (amount == null) return null;
	const info = getSmallestUnitInfo(item);
	if (!info) return { amount, unit: item?.unit ?? "" };
	return { amount: amount * info.factor, unit: info.unit };
}
