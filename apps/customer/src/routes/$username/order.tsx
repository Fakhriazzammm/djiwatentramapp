import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const orderSearchSchema = z.object({
	step: z
		.enum(["party", "refill", "menu", "checkout", "payment", "receipt"])
		.optional()
		.default("party"),
	orderId: z.string().optional(),
	table: z.string().optional(),
});

export const Route = createFileRoute("/$username/order")({
	validateSearch: (search: Record<string, unknown>) =>
		orderSearchSchema.parse(search),
});
