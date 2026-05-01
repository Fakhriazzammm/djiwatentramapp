import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamAttendanceReportPage() {
	return <SettingsPage initialOperationalTab="attendance-report" mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance-report" as any)({
	component: OperationalTeamAttendanceReportPage,
});
