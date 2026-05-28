import { createLazyFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/operational-team/payroll" as any)({
	component: () => <Outlet />,
});
