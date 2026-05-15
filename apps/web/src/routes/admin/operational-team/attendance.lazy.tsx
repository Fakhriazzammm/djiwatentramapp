import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsPage } from "../settings.lazy";

function OperationalTeamAttendancePage() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<Link to="/admin/operational-team/attendance/pengaturan">
					<Button variant="outline" size="sm" className="gap-2">
						<Settings2 className="h-4 w-4" /> Pengaturan Shift & Lokasi
					</Button>
				</Link>
			</div>
			<SettingsPage key="attendance" initialOperationalTab="attendance-report" mode="operational-team" />
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance" as any)({
	component: OperationalTeamAttendancePage,
});
