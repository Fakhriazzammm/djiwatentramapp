import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/attendance" as any)({
	component: () => <Outlet />,
});
