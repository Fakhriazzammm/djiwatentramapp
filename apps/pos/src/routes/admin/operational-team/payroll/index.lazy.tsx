import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../../settings.lazy";

const relativePath = "/admin/operational-team/payroll/" as any;

function PayrollIndexPage() {
	return <SettingsPage key="payroll" initialOperationalTab="payroll" mode="operational-team" />;
}

export const Route = createLazyFileRoute(relativePath)({
	component: PayrollIndexPage,
});
