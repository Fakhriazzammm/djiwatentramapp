import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/$username/absensi")({
	validateSearch: (search: Record<string, unknown>) => ({
		enroll: search.enroll === 1 || search.enroll === "1" ? 1 : 0,
	}),
});
