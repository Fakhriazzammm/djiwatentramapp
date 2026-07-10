import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/absen-keluar-mini")({
  validateSearch: z.object({
    uid: z.string().optional(),
    t: z.union([z.string(), z.number()]).optional(),
  }),
});
