import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "./settings.lazy";

function OperationalTeamPage() {
	return <SettingsPage mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team" as any)({
	component: OperationalTeamPage,
});
