import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamAttendancePage() {
	return (
		<div className="space-y-4">
			<SettingsPage key="attendance" initialOperationalTab="attendance-report" mode="operational-team" />
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance" as any)({
	component: OperationalTeamAttendancePage,
});
