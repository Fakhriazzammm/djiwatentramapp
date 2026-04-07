import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import {
	Beer,
	Bot,
	Calendar,
	ChefHat,
	ChevronsRight,
	ClipboardList,
	Croissant,
	Package,
	Receipt,
	ShieldCheck,
	Sparkles,
	Tags,
	UtensilsCrossed,
} from "lucide-react";

type RoleMenuItem = {
	to: string;
	label: string;
	subtitle: string;
	icon: any;
	tone: string;
};

const ROLE_SECTIONS: ReadonlyArray<{
	role: string;
	description: string;
	items: ReadonlyArray<RoleMenuItem>;
}> = [
	{
		role: "Kasir",
		description: "Checkout cepat & kendali layanan customer",
		items: [
			{
				to: "/menu",
				label: "POS Kasir",
				subtitle: "Mulai transaksi",
				icon: Receipt,
				tone: "from-rose-500 to-orange-400",
			},
			{
				to: "/admin/orders",
				label: "Pesanan",
				subtitle: "Monitor order",
				icon: ClipboardList,
				tone: "from-blue-500 to-cyan-400",
			},
			{
				to: "/admin/customer-service",
				label: "Layanan",
				subtitle: "Komplain & bantuan",
				icon: ShieldCheck,
				tone: "from-emerald-500 to-teal-400",
			},
			{
				to: "/admin/discounts",
				label: "Promo",
				subtitle: "Voucher & diskon",
				icon: Tags,
				tone: "from-fuchsia-500 to-pink-500",
			},
			{
				to: "/admin/booking",
				label: "Booking",
				subtitle: "Reservasi meja",
				icon: Calendar,
				tone: "from-violet-500 to-indigo-500",
			},
		],
	},
	{
		role: "Barista",
		description: "Antrian minuman, status racik, dan stok bar",
		items: [
			{
				to: "/admin/bar",
				label: "Antrian Bar",
				subtitle: "Order minuman",
				icon: Beer,
				tone: "from-indigo-500 to-blue-500",
			},
			{
				to: "/admin/bar",
				label: "Stok Bar",
				subtitle: "Kontrol bahan bar",
				icon: Croissant,
				tone: "from-cyan-500 to-sky-400",
			},
			{
				to: "/admin/products",
				label: "Menu Bar",
				subtitle: "Kelola item minuman",
				icon: Package,
				tone: "from-slate-600 to-slate-500",
			},
		],
	},
	{
		role: "Kitchen",
		description: "Antrian dapur, produksi, dan stok bahan",
		items: [
			{
				to: "/admin/kitchen",
				label: "Antrian Dapur",
				subtitle: "Pesanan masuk",
				icon: ChefHat,
				tone: "from-orange-500 to-amber-400",
			},
			{
				to: "/admin/kitchen",
				label: "Stok Dapur",
				subtitle: "Pantau bahan",
				icon: UtensilsCrossed,
				tone: "from-amber-600 to-yellow-500",
			},
			{
				to: "/admin/products",
				label: "Menu Dapur",
				subtitle: "Kelola produk",
				icon: Package,
				tone: "from-lime-600 to-green-500",
			},
		],
	},
] as const;

export const Route = createLazyFileRoute("/home")({
	component: HomePage,
});

function HomePage() {
	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Yumi POS";
	const dateText = new Intl.DateTimeFormat("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(new Date());

	return (
		<div className="min-h-app bg-slate-100 text-foreground">
			<div className="mx-auto w-full max-w-md px-4 pb-8 pt-6 md:max-w-4xl">
				<div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-xl md:p-7">
					<div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
					<div className="absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
					<p className="relative text-xs uppercase tracking-[0.24em] text-white/70">
						Mobile Super App
					</p>
					<h1 className="relative mt-2 font-black text-2xl leading-tight tracking-tight md:text-3xl">
						{storeName}
					</h1>
					<p className="relative mt-1 text-sm text-white/80">{dateText}</p>
					<div className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
						<Sparkles className="h-3.5 w-3.5" />
						Akses cepat untuk kasir, barista, dan kitchen
					</div>
				</div>

				<div className="mt-5 space-y-4">
					{ROLE_SECTIONS.map((section) => (
						<div
							className="rounded-[26px] bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5"
							key={section.role}
						>
							<div className="mb-3">
								<p className="font-black text-base tracking-tight text-slate-900">
									{section.role}
								</p>
								<p className="text-xs text-slate-500">{section.description}</p>
							</div>

							<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
								{section.items.map((item) => (
									<Link
										className="group relative overflow-hidden rounded-2xl bg-slate-50 p-3.5 text-left ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md"
										key={`${section.role}-${item.label}`}
										to={item.to}
									>
										<div
											className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.tone} text-white shadow-sm`}
										>
											<item.icon className="h-5 w-5" />
										</div>
										<p className="font-bold text-[13px] text-slate-900 leading-tight">
											{item.label}
										</p>
										<p className="mt-1 text-[11px] text-slate-500">
											{item.subtitle}
										</p>
										<div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors group-hover:text-slate-700">
											Buka
											<ChevronsRight className="h-3.5 w-3.5" />
										</div>
									</Link>
								))}
							</div>
						</div>
					))}
				</div>

				<div className="mt-4 rounded-[26px] bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
					<p className="mb-3 font-black text-base tracking-tight text-slate-900">
						Shortcut Umum
					</p>
					<div className="grid grid-cols-2 gap-3">
						<Link
							className="group relative overflow-hidden rounded-2xl bg-slate-50 p-3.5 text-left ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md"
							to="/admin/ai-chat"
						>
							<div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-sm">
								<Bot className="h-5 w-5" />
							</div>
							<p className="font-bold text-[13px] text-slate-900 leading-tight">
								AI Chat
							</p>
							<p className="mt-1 text-[11px] text-slate-500">
								Asisten operasional cepat
							</p>
							<div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors group-hover:text-slate-700">
								Buka
								<ChevronsRight className="h-3.5 w-3.5" />
							</div>
						</Link>
					</div>
					</div>

				<div className="mt-4 rounded-2xl bg-white px-4 py-3 text-center text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200">
					Tap satu tombol untuk langsung pindah ke halaman kerja.
				</div>
			</div>
		</div>
	);
}
