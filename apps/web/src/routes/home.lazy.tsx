import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import {
	Beer,
	Bot,
	ChefHat,
	ChevronsRight,
	CircleDollarSign,
	ClipboardList,
	Settings,
	ShieldCheck,
	Sparkles,
	Store,
} from "lucide-react";

const HOME_MENU_ITEMS = [
	{
		to: "/admin/ai-chat",
		label: "AI Chat",
		subtitle: "Asisten cepat",
		icon: Bot,
		tone: "from-sky-500 to-cyan-400",
	},
	{
		to: "/admin/kitchen",
		label: "Dapur",
		subtitle: "Status produksi",
		icon: ChefHat,
		tone: "from-orange-500 to-amber-400",
	},
	{
		to: "/admin/bar",
		label: "Bar",
		subtitle: "Antrian minuman",
		icon: Beer,
		tone: "from-indigo-500 to-blue-500",
	},
	{
		to: "/admin/customer-service",
		label: "Layanan",
		subtitle: "Operasional tim",
		icon: ShieldCheck,
		tone: "from-emerald-500 to-teal-400",
	},
	{
		to: "/admin/finance",
		label: "Keuangan",
		subtitle: "Ringkasan kas",
		icon: CircleDollarSign,
		tone: "from-green-600 to-lime-500",
	},
	{
		to: "/admin/orders",
		label: "Pesanan",
		subtitle: "Monitor order",
		icon: ClipboardList,
		tone: "from-rose-500 to-pink-500",
	},
	{
		to: "/admin/products",
		label: "Produk",
		subtitle: "Kelola menu",
		icon: Store,
		tone: "from-violet-500 to-fuchsia-500",
	},
	{
		to: "/admin/settings",
		label: "Pengaturan",
		subtitle: "Konfigurasi app",
		icon: Settings,
		tone: "from-slate-600 to-slate-500",
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
		<div className="min-h-screen bg-slate-100 text-foreground">
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
						Akses cepat untuk operasional harian
					</div>
				</div>

				<div className="mt-5 rounded-[26px] bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
					<div className="mb-3 flex items-center justify-between">
						<p className="font-black text-base tracking-tight text-slate-900">
							Menu Utama
						</p>
						<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
							8 Fitur
						</span>
					</div>

					<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					{HOME_MENU_ITEMS.map((item) => (
						<Link
							className="group relative overflow-hidden rounded-2xl bg-slate-50 p-3.5 text-left ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md"
							key={item.to}
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
							<p className="mt-1 text-[11px] text-slate-500">{item.subtitle}</p>
							<div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors group-hover:text-slate-700">
								Buka
								<ChevronsRight className="h-3.5 w-3.5" />
							</div>
						</Link>
					))}
					</div>
				</div>
				<div className="mt-4 rounded-2xl bg-white px-4 py-3 text-center text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200">
					Tap satu tombol untuk langsung pindah ke halaman kerja.
				</div>
			</div>
		</div>
	);
}
