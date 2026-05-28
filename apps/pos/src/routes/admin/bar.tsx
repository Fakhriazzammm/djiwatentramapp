import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const barSearchSchema = z.object({
	tab: z.enum(["orders", "stock"]).optional(),
});

export const Route = createFileRoute("/admin/bar" as any)({
	validateSearch: (search: Record<string, unknown>) => barSearchSchema.parse(search),
});
