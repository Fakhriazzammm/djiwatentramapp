import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamAttendanceLogsPage() {
	return <SettingsPage initialOperationalTab="attendance-logs" mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance-logs" as any)({
	component: OperationalTeamAttendanceLogsPage,
});
