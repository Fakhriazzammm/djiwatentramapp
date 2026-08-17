import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  orderId: z.string().optional(),
  stage: z.enum(["order", "tracking"]).optional().default("order"),
});

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
});
