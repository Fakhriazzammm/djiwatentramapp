import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamRegisterPage() {
	return <SettingsPage key="register" initialOperationalTab="register" mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/register" as any)({
	component: OperationalTeamRegisterPage,
});
