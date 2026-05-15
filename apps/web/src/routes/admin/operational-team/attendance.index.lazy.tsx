import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileBarChart, ClipboardList } from "lucide-react";
import { SettingsPage } from "../settings.lazy";

type AttendanceTab = "attendance-report" | "attendance-logs";

const tabs: { id: AttendanceTab; label: string; icon: typeof FileBarChart }[] = [
	{ id: "attendance-report", label: "Data Absensi", icon: FileBarChart },
	{ id: "attendance-logs", label: "Log Absensi", icon: ClipboardList },
];

function AttendanceIndexPage() {
	const [activeTab, setActiveTab] = useState<AttendanceTab>("attendance-report");

	return (
		<div className="space-y-4">
			{/* Tab Switcher */}
			<div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 md:p-1.5">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveTab(tab.id)}
						className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
							activeTab === tab.id
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						<tab.icon className="h-4 w-4" />
						{tab.label}
					</button>
				))}
			</div>

			{/* SettingsPage re-mounts on tab change via key */}
			<SettingsPage
				key={activeTab}
				initialOperationalTab={activeTab}
				mode="operational-team"
			/>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance/" as any)({
	component: AttendanceIndexPage,
});
