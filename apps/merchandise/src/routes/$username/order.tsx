import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const orderSearchSchema = z.object({
	step: z
		.enum(["table", "party", "refill", "menu", "checkout", "shipping", "payment", "receipt"])
		.optional()
		.default("menu"),
	orderId: z.string().optional(),
	table: z.string().optional(),
});

export const Route = createFileRoute("/$username/order")({
	validateSearch: (search: Record<string, unknown>) =>
		orderSearchSchema.parse(search),
});
