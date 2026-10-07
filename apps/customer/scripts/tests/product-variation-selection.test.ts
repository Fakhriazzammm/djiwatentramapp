import assert from "node:assert/strict";
import test from "node:test";
import {
	calculateProductVariationPrice,
	getProductVariationGroupKey,
} from "../../src/lib/product-variations.ts";

test("each variation group keeps its own selected option and price", () => {
	const groups = [
		{
			name: "Panas/Dingin",
			options: [
				{ name: "Panas", price: 0 },
				{ name: "Dingin", price: 0 },
			],
		},
		{
			name: "Beans",
			options: [
				{ name: "Regular", price: 0 },
				{ name: "Seasonal", price: 5000 },
			],
		},
	];
	const selections: Record<string, string> = {};

	selections[getProductVariationGroupKey(groups[0], 0)] = "Dingin";
	selections[getProductVariationGroupKey(groups[1], 1)] = "Seasonal";

	assert.deepEqual(selections, {
		"0:Panas/Dingin": "Dingin",
		"1:Beans": "Seasonal",
	});
	assert.equal(calculateProductVariationPrice(groups, selections), 5000);

	selections[getProductVariationGroupKey(groups[0], 0)] = "Panas";
	assert.deepEqual(selections, {
		"0:Panas/Dingin": "Panas",
		"1:Beans": "Seasonal",
	});
	assert.equal(calculateProductVariationPrice(groups, selections), 5000);
});

test("variation groups with the legacy type field remain supported", () => {
	assert.equal(
		getProductVariationGroupKey(
			{ type: "Size", options: [{ name: "Large", price: 2000 }] },
			0,
		),
		"0:Size",
	);
});
