import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const orderSearchSchema = z.object({
	step: z
		.enum(["table", "party", "refill", "menu", "checkout", "payment", "receipt"])
		.optional()
		.default("table"),
	orderId: z.string().optional(),
	table: z.preprocess(
		(value) => (value === undefined || value === null ? value : String(value)),
		z.string().optional(),
	),
});

export const Route = createFileRoute("/$username/order")({
	validateSearch: (search: Record<string, unknown>) =>
		orderSearchSchema.parse(search),
});
