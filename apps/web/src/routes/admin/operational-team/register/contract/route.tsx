import { createFileRoute, Outlet } from "@tanstack/react-router";

function ContractLayout() {
	return <Outlet />;
}

export const Route = createFileRoute(
	"/admin/operational-team/register/contract" as any,
)({
	component: ContractLayout,
});
