import { Link, useLocation } from "@tanstack/react-router";
import {
	LayoutDashboard,
	Receipt,
	ClipboardList,
	Sparkles,
} from "lucide-react";

type BottomTab = {
	to: string;
	label: string;
	icon: React.ElementType;
	isCenter?: boolean;
};

const BOTTOM_TABS: ReadonlyArray<BottomTab> = [
	{
		to: "/home",
		label: "Home",
		icon: LayoutDashboard,
	},
	{
		to: "/menu",
		label: "POS",
		icon: Receipt,
	},
	{
		to: "/admin/ai-chat",
		label: "AI",
		icon: Sparkles,
		isCenter: true,
	},
	{
		to: "/admin/orders",
		label: "Orders",
		icon: ClipboardList,
	},
] as const;

function isActive(pathname: string, tabTo: string): boolean {
	if (tabTo === "/home") {
		return pathname === "/home";
	}
	return pathname.startsWith(tabTo);
}

export function HomeBottomNav() {
	const location = useLocation();
	const pathname = location.pathname;

	return (
		<nav className="app-bottom-bar fixed inset-x-0 bottom-0 z-40 safe-area-bottom md:hidden">
			<div className="flex items-stretch px-2">
				{BOTTOM_TABS.map((tab) => {
					const Icon = tab.icon;
					const active = isActive(pathname, tab.to);

					if (tab.isCenter) {
						return (
							<div
								key={tab.to}
								className="flex-1 flex items-center justify-center relative"
							>
								<Link
									to={tab.to as any}
									className="-top-4 relative flex flex-col items-center justify-center"
								>
									<div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg blur-[2px] absolute inset-0" />
									<div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg relative z-10">
										<Icon className="h-6 w-6 text-primary-foreground" />
									</div>
									<span className="font-medium text-[10px] text-primary mt-0.5">
										{tab.label}
									</span>
								</Link>
							</div>
						);
					}

					return (
						<Link
							key={tab.to}
							to={tab.to as any}
							className="flex-1 flex flex-col items-center justify-center gap-1 py-2"
						>
							<div
								className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
									active
										? "bg-primary text-primary-foreground shadow-sm"
										: "text-muted-foreground"
								}`}
							>
								<Icon className="h-4 w-4" />
							</div>
							<span
								className={`font-medium text-[10px] leading-tight ${
									active ? "text-primary" : "text-muted-foreground"
								}`}
							>
								{tab.label}
							</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}

export default HomeBottomNav;
