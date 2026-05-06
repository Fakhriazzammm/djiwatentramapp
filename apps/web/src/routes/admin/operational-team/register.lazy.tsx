import { createLazyFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamRegisterPage() {
	const location = useLocation();
	const isNestedContractRoute = location.pathname.endsWith("/register/contract");

	if (isNestedContractRoute || location.pathname.endsWith("/register/onboarding")) {
		return <Outlet />;
	}

	return <SettingsPage key="register" initialOperationalTab="register" mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/register" as any)({
	component: OperationalTeamRegisterPage,
});
