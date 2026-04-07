import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
	Beer,
	Bot,
	Calendar,
	ChefHat,
	ChevronsRight,
	ClipboardList,
	Copy,
	Croissant,
	LockKeyhole,
	Loader2,
	Package,
	Receipt,
	ShieldCheck,
	Sparkles,
	Tags,
	UtensilsCrossed,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatCurrencyIDR } from "@/lib/export-utils";

const HOME_PIN_SESSION_KEY = "home_access_unlocked_v1";

type RoleMenuItem = {
	to: string;
	label: string;
	subtitle: string;
	icon: any;
	tone: string;
};

type ShiftRow = {
	shiftId: string;
	shiftName: string;
	cashierName: string;
	teamMembers: string;
	startTime: number;
	endTime?: number;
	status: "SELESAI" | "AKTIF";
	startingCash: number;
	cashRevenue: number;
	qrisRevenue: number;
	otherRevenue: number;
	totalGrossSales: number;
	totalDiscount: number;
	totalRevenue: number;
	totalExpenses: number;
	totalItemsSold: number;
	orderCount: number;
	bookingCount: number;
	hasTarget?: boolean;
	shiftTarget?: number;
	shiftCollected?: number;
	dailyTarget?: number;
	dailyCollected?: number;
	isShiftTargetMet?: boolean;
	isDailyTargetMet?: boolean;
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

function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("id-ID", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

function formatTime(timestamp?: number) {
	if (!timestamp) return "Aktif";
	return new Date(timestamp).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function buildShiftSummaryText(shift: ShiftRow, details: any) {
	const topProducts = details?.topProducts ?? [];
	const productBreakdown = details?.productBreakdown ?? [];
	const expenseBreakdown = details?.expenseBreakdown ?? [];
	const teamLabel = shift.teamMembers?.trim() ? shift.teamMembers : "-";
	const lines: string[] = [
		"Daily Revenue Report",
		"Djiwa Tentram Cafe & Resto",
		`Tanggal: ${formatDate(shift.startTime)}`,
		"",
		`${shift.shiftName} (${shift.status})`,
		`Modal Kasir: ${formatCurrencyIDR(shift.startingCash)}`,
		`Tunai: ${formatCurrencyIDR(shift.cashRevenue)}`,
		`Debit/QRIS: ${formatCurrencyIDR(shift.qrisRevenue)}`,
		`Lainnya: ${formatCurrencyIDR(shift.otherRevenue)}`,
		"",
		`Total Penjualan Bruto: ${formatCurrencyIDR(shift.totalGrossSales)}`,
		`Total Potongan (Diskon): ${formatCurrencyIDR(shift.totalDiscount)}`,
		`Total Revenue Bersih: ${formatCurrencyIDR(shift.totalRevenue)}`,
		"",
		`Produk Terjual: ${shift.totalItemsSold}`,
		"Rincian Produk:",
	];

	if (productBreakdown.length > 0) {
		for (const category of productBreakdown) {
			lines.push(`- ${category.categoryName} (${category.totalQuantity})`);
			for (const item of category.items) {
				lines.push(`  - ${item.productName}: ${item.quantity}`);
			}
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	lines.push("TOP 3 PRODUK TERLARIS:");
	if (topProducts.length > 0) {
		for (const item of topProducts) {
			lines.push(`- ${item.productName}: ${item.quantity}`);
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	if (shift.hasTarget) {
		lines.push("STATUS TARGET:");
		lines.push(
			`- Target Shift: ${formatCurrencyIDR(shift.shiftTarget ?? 0)} (${shift.isShiftTargetMet ? "Tercapai" : "Belum Tercapai"})`,
		);
		lines.push(
			`- Target Harian: ${formatCurrencyIDR(shift.dailyTarget ?? 0)} (${shift.isDailyTargetMet ? "Tercapai" : "Belum Tercapai"})`,
		);
		lines.push(
			`- Revenue Harian: ${formatCurrencyIDR(shift.dailyCollected ?? 0)}`,
		);
		lines.push("");
	}

	lines.push(`Pengeluaran Shift: ${formatCurrencyIDR(shift.totalExpenses)}`);
	if (expenseBreakdown.length > 0) {
		for (const expense of expenseBreakdown) {
			lines.push(`- ${expense.category}: ${formatCurrencyIDR(expense.amount)}`);
		}
	}

	lines.push("");
	lines.push(`Kasir: ${shift.cashierName || "-"}`);
	lines.push(`Tim: ${teamLabel}`);

	return lines.join("\n");
}

export const Route = createLazyFileRoute("/home")({
	component: HomePage,
});

function HomePage() {
	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Yumi POS";
	const shiftRows = useQuery(api.finance.getShiftReportTable, {}) as
		| ShiftRow[]
		| undefined;
	const verifyHomePin = useMutation((api as any).users.verifyHomePin);

	const dateText = new Intl.DateTimeFormat("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(new Date());

	const [pinCode, setPinCode] = useState("");
	const [isVerifyingPin, setIsVerifyingPin] = useState(false);
	const [isUnlocked, setIsUnlocked] = useState(false);
	const [selectedShiftStart, setSelectedShiftStart] = useState<number | null>(null);

	useEffect(() => {
		const hasSession =
			typeof window !== "undefined" &&
			window.sessionStorage.getItem(HOME_PIN_SESSION_KEY) === "1";
		if (hasSession) {
			setIsUnlocked(true);
		}
	}, []);

	useEffect(() => {
		if (!shiftRows?.length) {
			setSelectedShiftStart(null);
			return;
		}
		if (
			selectedShiftStart === null ||
			!shiftRows.some((row) => row.startTime === selectedShiftStart)
		) {
			setSelectedShiftStart(shiftRows[0].startTime);
		}
	}, [shiftRows, selectedShiftStart]);

	const selectedShift =
		shiftRows?.find((shift) => shift.startTime === selectedShiftStart) ??
		shiftRows?.[0];

	const shiftDetails = useQuery(
		api.finance.getShiftDetails,
		selectedShift
			? {
					startTime: selectedShift.startTime,
					endTime: selectedShift.endTime,
			  }
			: "skip",
	);

	const summaryText = useMemo(() => {
		if (!selectedShift || !shiftDetails) return "";
		return buildShiftSummaryText(selectedShift, shiftDetails);
	}, [selectedShift, shiftDetails]);

	const handleUnlockHome = async () => {
		if (!/^\d{6}$/.test(pinCode)) {
			toast.error("PIN harus 6 digit angka");
			return;
		}

		try {
			setIsVerifyingPin(true);
			await verifyHomePin({ pinCode });
			window.sessionStorage.setItem(HOME_PIN_SESSION_KEY, "1");
			setIsUnlocked(true);
			setPinCode("");
			toast.success("PIN valid, akses dibuka");
		} catch (error) {
			console.error(error);
			toast.error((error as Error).message || "PIN tidak valid");
		} finally {
			setIsVerifyingPin(false);
		}
	};

	if (!isUnlocked) {
		return (
			<div className="app-page min-h-app bg-background text-foreground">
				<div className="mx-auto flex min-h-app w-full max-w-md items-center px-4 py-8">
					<div className="app-card w-full space-y-5 p-5 md:p-6">
						<div className="text-center">
							<div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
								<LockKeyhole className="h-6 w-6" />
							</div>
							<h1 className="mt-3 font-black text-2xl tracking-tight">
								Akses Home
							</h1>
							<p className="mt-1 text-sm text-muted-foreground">
								Masukkan PIN 6 digit yang diatur di Pengguna & Akses.
							</p>
						</div>

						<div className="space-y-2">
							<label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
								PIN Akses
							</label>
							<input
								type="password"
								inputMode="numeric"
								pattern="\d*"
								maxLength={6}
								autoFocus
								placeholder="••••••"
								value={pinCode}
								onChange={(e) =>
									setPinCode(e.target.value.replace(/\D/g, "").slice(0, 6))
								}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void handleUnlockHome();
									}
								}}
								className="w-full rounded-2xl border border-border bg-background p-3 text-center font-mono text-lg tracking-[0.45em] outline-none transition-all focus:ring-2 focus:ring-primary/20"
							/>
							<p className="text-[11px] text-muted-foreground">
								PIN hanya menerima angka 0-9.
							</p>
						</div>

						<button
							type="button"
							onClick={() => void handleUnlockHome()}
							disabled={isVerifyingPin}
							className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{isVerifyingPin ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Memverifikasi...
								</>
							) : (
								"Masuk /home"
							)}
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="app-page min-h-app text-foreground">
			<div className="mx-auto w-full max-w-md px-4 pb-8 pt-6 md:max-w-4xl">
				<div className="app-shell relative overflow-hidden p-5 md:p-7">
					<div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
					<div className="absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
					<p className="app-overline relative">Mobile Super App</p>
					<h1 className="relative mt-2 font-black text-2xl leading-tight tracking-tight md:text-3xl">
						{storeName}
					</h1>
					<p className="relative mt-1 text-sm text-muted-foreground">{dateText}</p>
					<div className="app-pill relative mt-4 inline-flex items-center gap-2 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
						<Sparkles className="h-3.5 w-3.5" />
						Akses cepat untuk kasir, barista, dan kitchen
					</div>
				</div>

				<div className="mt-5 space-y-4">
					{ROLE_SECTIONS.map((section) => (
						<div className="app-card p-4 md:p-5" key={section.role}>
							<div className="mb-3">
								<p className="font-black text-base tracking-tight text-foreground">
									{section.role}
								</p>
								<p className="text-xs text-muted-foreground">{section.description}</p>
							</div>

							<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
								{section.items.map((item) => (
									<Link
										className="group relative overflow-hidden rounded-2xl border border-border/70 bg-background p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
										key={`${section.role}-${item.label}`}
										to={item.to}
									>
										<div
											className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.tone} text-white shadow-sm`}
										>
											<item.icon className="h-5 w-5" />
										</div>
										<p className="font-bold text-[13px] leading-tight text-foreground">
											{item.label}
										</p>
										<p className="mt-1 text-[11px] text-muted-foreground">
											{item.subtitle}
										</p>
										<div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
											Buka
											<ChevronsRight className="h-3.5 w-3.5" />
										</div>
									</Link>
								))}
							</div>
						</div>
					))}
				</div>

				<div className="app-card mt-4 p-4 md:p-5">
					<p className="mb-3 font-black text-base tracking-tight text-foreground">
						Shortcut Umum
					</p>
					<div className="grid grid-cols-2 gap-3">
						<Link
							className="group relative overflow-hidden rounded-2xl border border-border/70 bg-background p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
							to="/admin/ai-chat"
						>
							<div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-sm">
								<Bot className="h-5 w-5" />
							</div>
							<p className="font-bold text-[13px] leading-tight text-foreground">
								AI Chat
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Asisten operasional cepat
							</p>
							<div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
								Buka
								<ChevronsRight className="h-3.5 w-3.5" />
							</div>
						</Link>
					</div>
				</div>

				<div className="app-card mt-4 px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground">
					Tap satu tombol untuk langsung pindah ke halaman kerja.
				</div>

				<div className="app-card mt-4 border border-border bg-card shadow-sm">
					<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
								Ringkasan Shift Realtime
							</p>
							<h3 className="mt-1 font-bold text-lg text-foreground">
								Ringkasan Per Shift
							</h3>
							<p className="mt-1 text-sm text-muted-foreground">
								Format sama seperti di halaman laporan shift, siap copy paste.
							</p>
						</div>
						<button
							type="button"
							disabled={!summaryText}
							onClick={async () => {
								if (!summaryText) return;
								await navigator.clipboard.writeText(summaryText);
								toast.success("Ringkasan shift berhasil disalin");
							}}
							className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
						>
							<Copy className="h-3.5 w-3.5" />
							Salin
						</button>
					</div>

					{shiftRows === undefined ? (
						<div className="px-4 py-8 text-sm text-muted-foreground">
							Memuat data shift...
						</div>
					) : shiftRows.length === 0 ? (
						<div className="px-4 py-8 text-sm text-muted-foreground">
							Belum ada data shift.
						</div>
					) : (
						<div className="space-y-4 p-4">
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
										Pilih Shift
									</label>
									<select
										className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
										value={selectedShift?.startTime ?? ""}
										onChange={(event) =>
											setSelectedShiftStart(Number(event.target.value))
										}
									>
										{shiftRows.map((shift) => (
											<option key={shift.shiftId} value={shift.startTime}>
												{shift.shiftName} - {formatDate(shift.startTime)} (
												{shift.status})
											</option>
										))}
									</select>
								</div>
								<div className="grid gap-2 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Kasir</span>
										<span className="font-semibold text-foreground">
											{selectedShift?.cashierName || "-"}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Durasi</span>
										<span className="font-semibold text-foreground">
											{selectedShift
												? `${formatTime(selectedShift.startTime)} - ${formatTime(selectedShift.endTime)}`
												: "-"}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Revenue Bersih</span>
										<span className="font-semibold text-primary">
											{formatCurrencyIDR(selectedShift?.totalRevenue ?? 0)}
										</span>
									</div>
								</div>
							</div>

							<div className="rounded-2xl border border-border bg-slate-950 p-3 text-slate-50 shadow-inner">
								<div className="mb-3 flex items-center justify-between">
									<h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
										Format Ringkasan
									</h4>
									<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
										Siap salin
									</span>
								</div>
								<pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-100">
									{summaryText}
								</pre>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
