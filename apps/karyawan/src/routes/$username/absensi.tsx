import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";

export const Route = createFileRoute("/$username/absensi")({
	validateSearch: (search: { enroll?: unknown } & SearchSchemaInput) => ({
		enroll: search.enroll === 1 || search.enroll === "1" ? 1 : 0,
	}),
});
