import { createLazyFileRoute } from "@tanstack/react-router";
import KaryawanOverview from "./-components/KaryawanOverview";

function KaryawanPage() {
	return <KaryawanOverview />;
}

export const Route = createLazyFileRoute("/admin/operational-team/karyawan")({
	component: KaryawanPage,
});
