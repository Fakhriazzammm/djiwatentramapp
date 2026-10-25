import { createLazyFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import KaryawanOverview from "./-components/KaryawanOverview";

function KaryawanPage() {
	const pathname = useLocation({ select: (location) => location.pathname });
	return pathname.replace(/\/$/, "") === "/admin/operational-team/karyawan"
		? <KaryawanOverview />
		: <Outlet />;
}

export const Route = createLazyFileRoute("/admin/operational-team/karyawan")({
	component: KaryawanPage,
});
