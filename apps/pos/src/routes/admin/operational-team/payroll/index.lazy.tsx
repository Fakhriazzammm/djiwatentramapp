import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../../settings.lazy";

function PayrollIndexPage() {
	return <SettingsPage key="payroll" initialOperationalTab="payroll" mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/payroll/")({
	component: PayrollIndexPage,
});
