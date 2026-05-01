import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamAttendancePage() {
	return <SettingsPage initialOperationalTab="attendance" mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance" as any)({
	component: OperationalTeamAttendancePage,
});
