import { Link } from "@tanstack/react-router";
import {
	Beer,
	Bot,
	Calendar,
	ChefHat,
	ChevronsRight,
	CreditCard,
	Package,
	Tags,
} from "lucide-react";

interface ServiceItem {
	label: string;
	subtitle: string;
	icon: React.ComponentType<{ className?: string }>;
	gradient: string;
	href: string;
	/** Permission key required to see this item, if any */
	permissionKey?: string;
}

const SERVICE_ITEMS: ReadonlyArray<ServiceItem> = [
	{
		label: "AI Chat",
		subtitle: "Asisten operasional cepat",
		icon: Bot,
		gradient: "from-sky-500 to-cyan-400",
		href: "/admin/ai-chat",
	},
	{
		label: "Booking",
		subtitle: "Reservasi meja",
		icon: Calendar,
		gradient: "from-violet-500 to-indigo-500",
		href: "/admin/booking",
	},
	{
		label: "Promo",
		subtitle: "Voucher & diskon",
		icon: Tags,
		gradient: "from-fuchsia-500 to-pink-500",
		href: "/admin/discounts",
	},
	{
		label: "Produk",
		subtitle: "Kelola menu & produk",
		icon: Package,
		gradient: "from-emerald-500 to-green-500",
		href: "/admin/products",
	},
	{
		label: "Bar",
		subtitle: "Antrian & stok bar",
		icon: Beer,
		gradient: "from-indigo-500 to-blue-500",
		href: "/admin/bar",
	},
	{
		label: "Kitchen",
		subtitle: "Pesanan masuk dapur",
		icon: ChefHat,
		gradient: "from-orange-500 to-amber-400",
		href: "/admin/kitchen",
	},
	{
		label: "Inventory",
		subtitle: "Stok bahan baku",
		icon: Package,
		gradient: "from-slate-600 to-slate-500",
		href: "/admin/inventory",
	},
	{
		label: "Keuangan",
		subtitle: "Laporan keuangan",
		icon: CreditCard,
		gradient: "from-amber-600 to-yellow-500",
		href: "/admin/finance",
	},
];

interface HomeServiceGridProps {
	permissions?: string[];
}

export function HomeServiceGrid({ permissions = [] }: HomeServiceGridProps) {
	const hasPermissions = permissions.length > 0;

	const visibleItems = hasPermissions
		? SERVICE_ITEMS.filter(
				(item) => !item.permissionKey || permissions.includes(item.permissionKey),
			)
		: SERVICE_ITEMS;

	return (
		<div className="grid grid-cols-2 gap-3">
			{visibleItems.map((item) => {
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
