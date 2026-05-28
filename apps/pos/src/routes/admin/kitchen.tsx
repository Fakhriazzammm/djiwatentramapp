import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const kitchenSearchSchema = z.object({
	tab: z.enum(["orders", "stock"]).optional(),
});

export const Route = createFileRoute("/admin/kitchen" as any)({
	validateSearch: (search: Record<string, unknown>) => kitchenSearchSchema.parse(search),
});
