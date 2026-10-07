export type ProductVariationOption = {
	name: string;
	price: number;
};

export type ProductVariationGroup = {
	name?: string | null;
	type?: string | null;
	options: ProductVariationOption[];
};

export function getProductVariationGroupKey(
	group: ProductVariationGroup,
	index: number,
): string {
	const groupName = group.name?.trim() || group.type?.trim();
	return groupName ? `${index}:${groupName}` : `variation-${index}`;
}

export function calculateProductVariationPrice(
	groups: ProductVariationGroup[],
	selections: Record<string, string>,
): number {
	return Object.entries(selections).reduce((sum, [groupKey, optionName]) => {
		const group = groups.find(
			(entry, index) => getProductVariationGroupKey(entry, index) === groupKey,
		);
		const option = group?.options.find((entry) => entry.name === optionName);
		return sum + (Number(option?.price) || 0);
	}, 0);
}
