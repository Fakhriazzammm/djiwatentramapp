import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/$username/koreksi-absen")({
	validateSearch: z.object({ date: z.string().optional(), type: z.enum(["check_in", "check_out"]).optional() }),
});
