import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/$username/absen-keluar")({
  validateSearch: z.object({
    shift: z.string().optional(),
    ts: z.string().optional(),
  }),
});
