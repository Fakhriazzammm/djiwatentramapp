import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const trackingSearchSchema = z.object({ orderId: z.string().min(1) });

export const Route = createFileRoute("/$username/tracking")({
  validateSearch: (search: Record<string, unknown>) => trackingSearchSchema.parse(search),
});
