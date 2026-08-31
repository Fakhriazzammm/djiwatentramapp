export type SplitBillSourceItem = {
	id: string;
	name: string;
	quantity: number;
	unitPrice: number;
	variant?: string;
};

export type SplitBillAssignment = {
	itemId: string;
	person: string;
	quantity: number;
};

export type SplitBillPerson = {
	name: string;
	items: Array<SplitBillSourceItem & { assignedQuantity: number; subtotal: number }>;
	subtotal: number;
};

export type SplitBillResult = {
	people: SplitBillPerson[];
	unassigned: Array<SplitBillSourceItem & { assignedQuantity: number; subtotal: number }>;
	assignedTotal: number;
	unassignedTotal: number;
	isBalanced: boolean;
	errors: string[];
};

const safeQuantity = (value: number) => Math.max(0, Math.floor(Number(value) || 0));
const safePrice = (value: number) => Math.max(0, Number(value) || 0);

export function calculateSplitBill(
	items: SplitBillSourceItem[],
	assignments: SplitBillAssignment[],
): SplitBillResult {
	const errors: string[] = [];
	const assignmentByItem = new Map<string, SplitBillAssignment[]>();

	for (const assignment of assignments) {
		const person = assignment.person.trim();
		const quantity = safeQuantity(assignment.quantity);
		if (!assignment.itemId || !person || quantity === 0) continue;
		const current = assignmentByItem.get(assignment.itemId) ?? [];
		current.push({ ...assignment, person, quantity });
		assignmentByItem.set(assignment.itemId, current);
	}

	const peopleMap = new Map<string, SplitBillPerson>();
	const unassigned: SplitBillResult["unassigned"] = [];
	let assignedTotal = 0;
	let unassignedTotal = 0;

	for (const item of items) {
		const quantity = safeQuantity(item.quantity);
		const unitPrice = safePrice(item.unitPrice);
		const itemAssignments = assignmentByItem.get(item.id) ?? [];
		const assignedQuantity = itemAssignments.reduce((sum, entry) => sum + safeQuantity(entry.quantity), 0);
		if (assignedQuantity > quantity) {
			errors.push(`${item.name}: quantity terbagi melebihi jumlah order`);
		}

		const cappedAssigned = Math.min(quantity, assignedQuantity);
		const unassignedQuantity = Math.max(0, quantity - cappedAssigned);
		for (const entry of itemAssignments) {
			const personQuantity = Math.min(safeQuantity(entry.quantity), quantity);
			if (!personQuantity) continue;
			const person = peopleMap.get(entry.person) ?? { name: entry.person, items: [], subtotal: 0 };
			const subtotal = personQuantity * unitPrice;
			person.items.push({ ...item, assignedQuantity: personQuantity, subtotal });
			person.subtotal += subtotal;
			assignedTotal += subtotal;
			peopleMap.set(entry.person, person);
		}
		if (unassignedQuantity > 0) {
			const subtotal = unassignedQuantity * unitPrice;
			unassigned.push({ ...item, assignedQuantity: unassignedQuantity, subtotal });
			unassignedTotal += subtotal;
		}
	}

	return {
		people: [...peopleMap.values()],
		unassigned,
		assignedTotal,
		unassignedTotal,
		isBalanced: errors.length === 0 && assignedTotal + unassignedTotal === items.reduce((sum, item) => sum + safeQuantity(item.quantity) * safePrice(item.unitPrice), 0),
		errors: [...new Set(errors)],
	};
}
