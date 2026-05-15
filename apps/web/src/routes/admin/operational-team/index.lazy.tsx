import { createLazyFileRoute } from "@tanstack/react-router";
import OperationalDashboard from "./-components/OperationalDashboard";

function OperationalTeamIndexPage() {
	return <OperationalDashboard />;
}

export const Route = createLazyFileRoute("/admin/operational-team/" as any)({
	component: OperationalTeamIndexPage,
});
