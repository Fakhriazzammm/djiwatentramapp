import { Link } from "@tanstack/react-router";
import {
	Bot,
	BookOpen,
	Receipt,
	UserCheck,
	Sparkles,
	ChevronsRight,
} from "lucide-react";

type RepeatItem = {
	to: string;
	label: string;
	subtitle: string;
	icon: React.ElementType;
};

const REPEAT_ITEMS: ReadonlyArray<RepeatItem> = [
	{
		to: "/admin/ai-chat",
		label: "AI Chat",
		subtitle: "Tanya apapun",
		icon: Bot,
	},
	{
		to: "/admin/recipe/view",
		label: "Buku Resep",
		subtitle: "Resep & panduan",
		icon: BookOpen,
	},
	{
		to: "/menu",
		label: "Menu POS",
		subtitle: "Transaksi cepat",
		icon: Receipt,
	},
	{
		to: "/attendance",
		label: "Absensi",
		subtitle: "Catat kehadiran",
		icon: UserCheck,
	},
] as const;

export function HomeRepeatUsage() {
	return (
		<section className="px-4">
			<div className="flex items-center gap-2 mb-4">
				<Sparkles className="h-4 w-4 text-primary" />
				<h2 className="app-overline m-0">Lebih Cepat Pakai Lagi</h2>
			</div>

			<div className="grid grid-cols-1 gap-3">
				{REPEAT_ITEMS.map((item) => {
					const Icon = item.icon;
					return (
						<Link
							key={item.to}
							to={item.to as any}
							className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 active:scale-[0.98] transition-transform"
						>
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
								<Icon className="h-5 w-5" />
							</div>

							<div className="flex-1 min-w-0">
								<p className="font-bold text-[13px] leading-tight truncate">
									{item.label}
								</p>
								<p className="text-[11px] text-muted-foreground leading-tight truncate">
									{item.subtitle}
								</p>
							</div>

							<ChevronsRight className="h-4 w-4 shrink-0 text-muted-foreground" />
						</Link>
					);
				})}
			</div>
		</section>
	);
}

export default HomeRepeatUsage;
