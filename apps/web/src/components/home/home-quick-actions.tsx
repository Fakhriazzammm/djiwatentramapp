import { Link } from "@tanstack/react-router";
import {
	ChevronsRight,
	ClipboardList,
	Receipt,
	TrendingUp,
	UserCheck,
} from "lucide-react";

interface QuickActionItem {
	label: string;
	subtitle: string;
	icon: React.ComponentType<{ className?: string }>;
	gradient: string;
	href: string;
}

const QUICK_ACTIONS: ReadonlyArray<QuickActionItem> = [
	{
		label: "POS",
		subtitle: "Mulai transaksi",
		icon: Receipt,
		gradient: "from-rose-500 to-orange-400",
		href: "/menu",
	},
	{
		label: "Pesanan",
		subtitle: "Monitor order",
		icon: ClipboardList,
		gradient: "from-blue-500 to-cyan-400",
		href: "/admin/orders",
	},
	{
		label: "Absensi",
		subtitle: "Absen Masuk / Keluar",
		icon: UserCheck,
		gradient: "from-emerald-500 to-teal-400",
		href: "/attendance",
	},
	{
		label: "Laporan",
		subtitle: "Ringkasan shift",
		icon: TrendingUp,
		gradient: "from-violet-500 to-indigo-500",
		href: "/admin",
	},
];

interface HomeQuickActionsProps {
	userSlug?: string;
}

export function HomeQuickActions({ userSlug: _userSlug }: HomeQuickActionsProps) {
	void _userSlug;

	return (
		<div className="grid grid-cols-2 gap-3">
			{QUICK_ACTIONS.map((item) => {
				const Icon = item.icon;
				return (
					<Link
						key={item.href}
						className="group relative overflow-hidden rounded-xl border border-border/70 bg-background p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
						state={(prev) => ({
							...prev,
							fromHomeEntry: true,
						})}
						to={item.href as any}
					>
						<div
							className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${item.gradient} text-white shadow-sm`}
						>
							<Icon className="h-4 w-4" />
						</div>
						<p className="font-bold text-[12px] leading-tight text-foreground">
							{item.label}
						</p>
						<p className="mt-0.5 text-[10px] text-muted-foreground">
							{item.subtitle}
						</p>
						<div className="mt-2 inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
							Buka
							<ChevronsRight className="h-3 w-3" />
						</div>
					</Link>
				);
			})}
		</div>
	);
}
