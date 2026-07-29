import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/operational-team")({
	component: () => <Outlet />,
});
