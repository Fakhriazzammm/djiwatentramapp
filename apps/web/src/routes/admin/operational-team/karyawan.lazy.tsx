import { createLazyFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../settings.lazy";

function KaryawanPage() {
	return <SettingsPage mode="operational-team" />;
}

export const Route = createLazyFileRoute("/admin/operational-team/karyawan" as any)({
	component: KaryawanPage,
});
