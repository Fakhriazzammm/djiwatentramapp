import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamIndexPage() {
	return <SettingsPage mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/" as any)({
	component: OperationalTeamIndexPage,
});
