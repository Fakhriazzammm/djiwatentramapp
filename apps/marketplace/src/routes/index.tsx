import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const brandCustomerSearchSchema = z.object({
	table: z.string().optional(),
	orderId: z.string().optional(),
});

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) =>
		brandCustomerSearchSchema.parse(search),
});
