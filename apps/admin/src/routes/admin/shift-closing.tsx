import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibility route for Admin clients that still have the previous dashboard
 * bundle cached. The old shift cards linked to /admin/shift-closing.
 */
export const Route = createFileRoute("/admin/shift-closing")({
	beforeLoad: () => {
		throw redirect({
			to: "/admin/finance/shift-reports",
			search: { selectedStartTime: undefined },
		});
	},
});
