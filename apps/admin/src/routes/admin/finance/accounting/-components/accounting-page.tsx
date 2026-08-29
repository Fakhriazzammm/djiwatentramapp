import { useState } from "react";
import { AccountingEntriesView } from "./accounting-entries-view";
import { AccountingManager } from "./accounting-manager";
import { BookOpen, ListOrdered } from "lucide-react";

type Tab = "entries" | "coa";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
	{ key: "entries", label: "Akuntansi", icon: <BookOpen className="h-3.5 w-3.5" /> },
	{ key: "coa", label: "COA", icon: <ListOrdered className="h-3.5 w-3.5" /> },
];

export function AccountingPage() {
	const [activeTab, setActiveTab] = useState<Tab>("entries");

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
			{/* Tab bar */}
			<div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto border-b bg-white px-3 pb-0 pt-2 sm:px-4 sm:pt-3">
				{TABS.map((tab) => {
					const isActive = activeTab === tab.key;
					return (
						<button
							className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2 font-medium text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
								isActive
									? "bg-amber-50 text-amber-700 shadow-sm"
									: "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
							}`}
							key={tab.key}
							onClick={() => setActiveTab(tab.key)}
							type="button"
						>
							{tab.icon}
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{activeTab === "entries" && <AccountingEntriesView />}
				{activeTab === "coa" && <AccountingManager />}
			</div>
		</div>
	);
}
