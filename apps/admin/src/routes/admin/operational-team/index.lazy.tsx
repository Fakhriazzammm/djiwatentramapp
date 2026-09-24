import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

function OperationalTeamIndexPage() {
	return <Navigate replace to="/admin/karyawan" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/")({
	component: OperationalTeamIndexPage,
});
