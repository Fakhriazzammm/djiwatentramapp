type CustomerCategoryLike = Record<string, any>;

const HIDDEN_CUSTOMER_CATEGORY_NAMES = new Set(["event", "promo", "b2b"]);

export function getCustomerHiddenCategoryIds(categories: CustomerCategoryLike[]): Set<string> {
	const categoryById = new Map(categories.map((category) => [String(category._id), category]));
	const hiddenIds = new Set<string>();

	for (const category of categories) {
		let current: CustomerCategoryLike | undefined = category;
		const visited = new Set<string>();

		while (current) {
			const currentId = String(current._id);
			if (visited.has(currentId)) break;
			visited.add(currentId);

			const name = String(current.name ?? "").trim().toLowerCase();
			if (HIDDEN_CUSTOMER_CATEGORY_NAMES.has(name)) {
				hiddenIds.add(String(category._id));
				break;
			}

			const parentId: unknown = current.parentId;
			current = parentId == null ? undefined : categoryById.get(String(parentId));
		}
	}

	return hiddenIds;
}
