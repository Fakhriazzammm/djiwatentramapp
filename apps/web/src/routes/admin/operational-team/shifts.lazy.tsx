import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamShiftsPage() {
	return <SettingsPage initialOperationalTab="shifts" mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/shifts" as any)({
	component: OperationalTeamShiftsPage,
});
