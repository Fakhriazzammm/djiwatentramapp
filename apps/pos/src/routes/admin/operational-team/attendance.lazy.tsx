import { createLazyFileRoute, Outlet } from "@tanstack/react-router";

function OperationalTeamAttendancePage() {
	return <Outlet />;
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance" as any)({
	component: OperationalTeamAttendancePage,
});
