import { createFileRoute, Outlet } from "@tanstack/react-router";

function PreviewLayout() {
	return <Outlet />;
}

export const Route = createFileRoute("/admin/operational-team/register/contract/$templateId/preview")({
	component: PreviewLayout,
});
