import type { ManualStockItem } from "@yumipos/web-shared/lib/manual-stock";
import type { StockOverviewMovement } from "@/hooks/use-hybrid-inventory-admin-data";

export type MovementDirection = "incoming" | "outgoing" | "adjustment" | "other";

export type StockOverviewAnalytics = {
	stock: {
		total: number;
		available: number;
		out: number;
		unknown: number;
	};
	transactions: {
		incoming: number;
		outgoing: number;
		adjustments: number;
		other: number;
	};
	trend: Array<{ label: string; incoming: number; outgoing: number; adjustments: number; other: number }>;
	incomingItems: Array<{ inventoryId: string; name: string; records: number }>;
	outgoingItems: Array<{ inventoryId: string; name: string; records: number }>;
	recent: StockOverviewMovement[];
};

const dayKey = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};


const chartLabel = (date: Date, weekly: boolean) => {
	const label = new Intl.DateTimeFormat("id-ID", {
		day: "2-digit",
		month: "short",
	}).format(date);
	return weekly ? `Pekan ${label}` : label;
};

export function getMovementDirection(type: string): MovementDirection {
	switch (type.trim().toLowerCase()) {
		case "add":
		case "restock":
		case "production":
			return "incoming";
		case "usage":
			return "outgoing";
		case "adjust":
		case "adjustment":
			return "adjustment";
		default:
			return "other";
	}
}

export function getMovementLabel(type: string) {
	switch (type.trim().toLowerCase()) {
		case "add":
		case "restock":
			return "Barang masuk";
		case "production":
			return "Hasil produksi";
		case "usage":
			return "Barang keluar";
		case "adjust":
		case "adjustment":
			return "Penyesuaian";
		default:
			return type.trim()
				? `Lainnya · ${type.trim().replaceAll("_", " ")}`
				: "Lainnya";
	}
}

function summarizeItems(movements: StockOverviewMovement[], direction: "incoming" | "outgoing") {
	const byItem = new Map<string, { inventoryId: string; name: string; records: number }>();
	for (const movement of movements) {
		if (getMovementDirection(movement.type) !== direction) continue;
		const id = String(movement.inventoryId);
		const current = byItem.get(id) ?? {
			inventoryId: id,
			name: movement.name,
			records: 0,
		};
		current.records += 1;
		byItem.set(id, current);
	}
	return [...byItem.values()]
		.sort((left, right) => right.records - left.records || left.name.localeCompare(right.name, "id"))
		.slice(0, 5);
}

export function buildStockOverviewAnalytics(
	items: ManualStockItem[],
	movements: StockOverviewMovement[],
	daysWindow: number,
	now = Date.now(),
): StockOverviewAnalytics {
	const days = Math.max(1, Math.floor(daysWindow));
	const cutoff = now - days * 24 * 60 * 60 * 1000;
	const currentMovements = movements
		.filter((movement) => movement.timestamp >= cutoff && movement.timestamp <= now)
		.sort((left, right) => right.timestamp - left.timestamp);
	const incoming = currentMovements.filter((movement) => getMovementDirection(movement.type) === "incoming");
	const outgoing = currentMovements.filter((movement) => getMovementDirection(movement.type) === "outgoing");
	const adjustments = currentMovements.filter((movement) => getMovementDirection(movement.type) === "adjustment");
	const other = currentMovements.filter((movement) => getMovementDirection(movement.type) === "other");

	const stock = items.reduce(
		(summary, item) => {
			summary.total += 1;
			if (item.status === "available") summary.available += 1;
			else if (item.status === "out") summary.out += 1;
			else summary.unknown += 1;
			return summary;
		},
		{ total: 0, available: 0, out: 0, unknown: 0 },
	);

	const weekly = days > 30;
	const firstDay = new Date(now);
	firstDay.setHours(0, 0, 0, 0);
	firstDay.setDate(firstDay.getDate() - days + 1);
	const buckets = new Map<string, { label: string; incoming: number; outgoing: number; adjustments: number; other: number }>();
	for (let day = new Date(firstDay); day.getTime() <= now; day.setDate(day.getDate() + 1)) {
		const bucketDate = new Date(day);
		if (weekly) bucketDate.setDate(bucketDate.getDate() - ((bucketDate.getDay() + 6) % 7));
		const key = dayKey(bucketDate);
		if (!buckets.has(key)) {
			buckets.set(key, {
				label: chartLabel(bucketDate, weekly),
				incoming: 0,
				outgoing: 0,
				adjustments: 0,
				other: 0,
			});
		}
	}
	for (const movement of currentMovements) {
		const date = new Date(movement.timestamp);
		if (!Number.isFinite(date.getTime())) continue;
		if (weekly) date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
		const bucket = buckets.get(dayKey(date));
		if (!bucket) continue;
		const direction = getMovementDirection(movement.type);
		if (direction === "incoming") bucket.incoming += 1;
		else if (direction === "outgoing") bucket.outgoing += 1;
		else if (direction === "adjustment") bucket.adjustments += 1;
		else bucket.other += 1;
	}

	return {
		stock,
		transactions: {
			incoming: incoming.length,
			outgoing: outgoing.length,
			adjustments: adjustments.length,
			other: other.length,
		},
		trend: [...buckets.values()],
		incomingItems: summarizeItems(currentMovements, "incoming"),
		outgoingItems: summarizeItems(currentMovements, "outgoing"),
		recent: currentMovements.slice(0, 12),
	};
}
