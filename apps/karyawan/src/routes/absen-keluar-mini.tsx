import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/absen-keluar-mini")({
  validateSearch: z.object({
    uid: z.string().optional(),
    t: z.union([z.string(), z.number()]).optional(),
    sig: z.string().optional(),
    mode: z.enum(["home", "checkin", "checkout", "schedule", "recap", "leave", "profile", "closing"]).optional(),
  }),
});
