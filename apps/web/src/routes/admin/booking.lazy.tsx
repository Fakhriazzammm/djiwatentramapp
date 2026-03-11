import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	Calendar,
	Check,
	ChevronLeft,
	ChevronRight,
	Globe,
	Link as LinkIcon,
	List,
	Loader2,
	Save,
	Settings2,
	ShoppingBag,
	Smartphone,
	Users,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createLazyFileRoute("/admin/booking")({
	component: BookingSettingsPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
	"Januari","Februari","Maret","April","Mei","Juni",
	"Juli","Agustus","September","Oktober","November","Desember",
];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function formatDate(dateStr: string) {
	const [y, m, d] = dateStr.split("-").map(Number);
	return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function todayStr() {
	return new Date().toISOString().split("T")[0];
}

const STATUS_LABEL: Record<string, string> = {
	pending: "Menunggu",
	confirmed: "Dikonfirmasi",
	cancelled: "Dibatalkan",
	completed: "Selesai",
};
const PAY_LABEL: Record<string, string> = {
	pending: "Belum Bayar",
	paid: "Lunas",
	cancelled: "Batal",
};
const STATUS_COLOR: Record<string, string> = {
	pending: "bg-yellow-100 text-yellow-700",
	confirmed: "bg-blue-100 text-blue-700",
	cancelled: "bg-red-100 text-red-700",
	completed: "bg-green-100 text-green-700",
};
const PAY_COLOR: Record<string, string> = {
	pending: "bg-orange-100 text-orange-700",
	paid: "bg-green-100 text-green-700",
	cancelled: "bg-red-100 text-red-700",
};

// ─── Mini Calendar (admin view) ───────────────────────────────────────────────

function AdminCalendar({
	year,
	month,
	summary,
	onNavigate,
	onDayClick,
	selectedDate,
}: {
	year: number;
	month: number;
	summary: Record<string, { count: number; capacity: number; pending: number; confirmed: number }>;
	onNavigate: (y: number, m: number) => void;
	onDayClick: (date: string) => void;
	selectedDate: string | null;
}) {
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const firstDay = new Date(year, month, 1).getDay();
	const today = todayStr();

	const prevMonth = () => {
		if (month === 0) onNavigate(year - 1, 11);
		else onNavigate(year, month - 1);
	};
	const nextMonth = () => {
		if (month === 11) onNavigate(year + 1, 0);
		else onNavigate(year, month + 1);
	};

	return (
		<div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border px-5 py-3">
				<button
					className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
					onClick={prevMonth}
					type="button"
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<span className="font-bold text-foreground">
					{MONTH_NAMES[month]} {year}
				</span>
				<button
					className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
					onClick={nextMonth}
					type="button"
				>
					<ChevronRight className="h-4 w-4" />
				</button>
			</div>

			{/* Day headers */}
			<div className="grid grid-cols-7 border-b border-border">
				{DAY_NAMES.map((d) => (
					<div
						className="py-2 text-center font-bold text-muted-foreground text-[11px]"
						key={d}
					>
						{d}
					</div>
				))}
			</div>

			{/* Day cells */}
			<div className="grid grid-cols-7">
				{Array.from({ length: firstDay }).map((_, i) => (
					<div className="border-b border-r border-border/50 min-h-[64px]" key={`blank-${i}`} />
				))}
				{Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
					const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
					const info = summary[dateStr];
					const isSelected = selectedDate === dateStr;
					const isToday = dateStr === today;
					const isFull = info && info.capacity > 0 && info.count >= info.capacity;

					return (
						<button
							className={`min-h-[64px] border-b border-r border-border/50 p-1.5 text-left transition-all hover:bg-muted/50 ${
								isSelected ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""
							} ${isToday ? "font-bold" : ""}`}
							key={day}
							onClick={() => onDayClick(dateStr)}
							type="button"
						>
							<span
								className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
									isToday
										? "bg-primary text-primary-foreground"
										: "text-foreground"
								}`}
							>
								{day}
							</span>
							{info && info.count > 0 && (
								<div className="mt-1 space-y-0.5">
									<div
										className={`rounded px-1 text-[9px] font-bold leading-tight ${
											isFull
												? "bg-red-100 text-red-700"
												: "bg-primary/10 text-primary"
										}`}
									>
										{info.count}
										{info.capacity > 0 ? `/${info.capacity}` : ""} booking
									</div>
									{info.pending > 0 && (
										<div className="rounded bg-yellow-100 px-1 text-[9px] text-yellow-700 leading-tight">
											{info.pending} pending
										</div>
									)}
								</div>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ─── Order Row ────────────────────────────────────────────────────────────────

function OrderRow({
	order,
	onUpdateStatus,
}: {
	order: {
		_id: Id<"bookingOrders">;
		bookingCode: string;
		customerName: string;
		customerPhone: string;
		customerEmail: string;
		bookingDate: string;
		totalAmount: number;
		paymentMethod: string;
		paymentStatus: string;
		bookingStatus: string;
		notes?: string;
		items: { name: string; quantity: number; price: number }[];
		createdAt: number;
	};
	onUpdateStatus: (
		id: Id<"bookingOrders">,
		bookingStatus?: string,
		paymentStatus?: string
	) => void;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="rounded-xl border border-border bg-card overflow-hidden">
			<div
				className="flex flex-col gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors sm:flex-row sm:items-center"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="flex items-center gap-2 min-w-0">
					<span className="font-bold text-xs text-primary font-mono shrink-0">
						#{order.bookingCode}
					</span>
					<span className="truncate font-bold text-sm">{order.customerName}</span>
				</div>

				<div className="flex flex-wrap items-center gap-1.5 sm:ml-auto shrink-0">
					<span className="text-muted-foreground text-xs">{formatDate(order.bookingDate)}</span>
					<span
						className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[order.bookingStatus]}`}
					>
						{STATUS_LABEL[order.bookingStatus]}
					</span>
					<span
						className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PAY_COLOR[order.paymentStatus]}`}
					>
						{PAY_LABEL[order.paymentStatus]}
					</span>
					<span className="font-bold text-xs">
						Rp {order.totalAmount.toLocaleString("id-ID")}
					</span>
				</div>
			</div>

			{expanded && (
				<div className="border-t border-border bg-muted/20 p-4 space-y-4">
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						<div>
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Telepon</p>
							<p className="text-sm font-medium">{order.customerPhone}</p>
						</div>
						<div>
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</p>
							<p className="text-sm font-medium break-all">{order.customerEmail}</p>
						</div>
						<div>
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pembayaran</p>
							<p className="text-sm font-medium capitalize">{order.paymentMethod.replace("_", " ")}</p>
						</div>
						{order.notes && (
							<div className="col-span-full">
								<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Catatan</p>
								<p className="text-sm">{order.notes}</p>
							</div>
						)}
					</div>

					<div>
						<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Item Pesanan</p>
						<div className="space-y-1">
							{order.items.map((item, i) => (
								<div className="flex justify-between text-sm" key={i}>
									<span>{item.name} ×{item.quantity}</span>
									<span className="font-medium">Rp {(item.price * item.quantity).toLocaleString("id-ID")}</span>
								</div>
							))}
						</div>
					</div>

					<div className="flex flex-wrap gap-2 pt-2 border-t border-border">
						<span className="text-[10px] font-bold text-muted-foreground self-center">Ubah Status:</span>
						{order.bookingStatus !== "confirmed" && (
							<button
								className="rounded-lg bg-blue-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, "confirmed")}
								type="button"
							>
								<Check className="inline h-3 w-3 mr-1" />Konfirmasi
							</button>
						)}
						{order.bookingStatus !== "completed" && order.bookingStatus !== "cancelled" && (
							<button
								className="rounded-lg bg-green-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, "completed")}
								type="button"
							>
								Selesai
							</button>
						)}
						{order.bookingStatus !== "cancelled" && (
							<button
								className="rounded-lg bg-red-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, "cancelled")}
								type="button"
							>
								<X className="inline h-3 w-3 mr-1" />Batalkan
							</button>
						)}
						{order.paymentStatus !== "paid" && (
							<button
								className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
								onClick={() => onUpdateStatus(order._id, undefined, "paid")}
								type="button"
							>
								Tandai Lunas
							</button>
						)}
					</div>

					<p className="text-muted-foreground text-[10px]">
						Dipesan: {new Date(order.createdAt).toLocaleString("id-ID")}
					</p>
				</div>
			)}
		</div>
	);
}

// ─── Main Component ────────────────────────────────────────────────────────────

function BookingSettingsPage() {
	const settings = useQuery(api.booking.getSettings, { slug: "booking" });
	const updateSettings = useMutation(api.booking.updateSettings);
	const allProducts = useQuery(api.products.getAllProductsAdmin, {});
	const updateBookingStatus = useMutation(api.booking.updateBookingStatus);
	const setDateCapacity = useMutation(api.booking.setDateCapacity);
	const dateCapacities = useQuery(api.booking.getDateCapacities, { slug: "booking" });

	const today = new Date();
	const [calYear, setCalYear] = useState(today.getFullYear());
	const [calMonth, setCalMonth] = useState(today.getMonth());
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [listFilter, setListFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");

	const yearMonth = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
	const summary = useQuery(api.booking.getMonthBookingSummary, {
		slug: "booking",
		yearMonth,
	});

	const allOrders = useQuery(api.booking.getBookingOrders, {
		slug: "booking",
		date: selectedDate ?? undefined,
	});

	// Capacity form
	const [capDate, setCapDate] = useState(todayStr());
	const [capValue, setCapValue] = useState("");
	const [capNotes, setCapNotes] = useState("");
	const [isSavingCap, setIsSavingCap] = useState(false);

	// Settings form
	const [formData, setFormData] = useState({
		slug: "booking",
		title: "",
		description: "",
		logoUrl: "",
		bannerUrl: "",
		themeColor: "#1a2332",
		featuredProductIds: [] as string[],
		paymentMethods: [] as string[],
		bankDetails: "",
		isActive: true,
	});
	const [activeTab, setActiveTab] = useState<
		"calendar" | "orders" | "capacity" | "general" | "products" | "payment"
	>("calendar");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (settings) {
			setFormData({
				slug: settings.slug,
				title: settings.title,
				description: settings.description || "",
				logoUrl: settings.logoUrl || "",
				bannerUrl: settings.bannerUrl || "",
				themeColor: settings.themeColor || "#1a2332",
				featuredProductIds: settings.featuredProductIds || [],
				paymentMethods: settings.paymentMethods || [],
				bankDetails: settings.bankDetails || "",
				isActive: settings.isActive,
			});
		}
	}, [settings]);

	const handleSave = async () => {
		try {
			setIsSaving(true);
			await updateSettings(formData);
			toast.success("Pengaturan disimpan!");
		} catch {
			toast.error("Gagal menyimpan pengaturan");
		} finally {
			setIsSaving(false);
		}
	};

	const handleUpdateStatus = async (
		id: Id<"bookingOrders">,
		bookingStatus?: string,
		paymentStatus?: string
	) => {
		try {
			await updateBookingStatus({
				id,
				bookingStatus: bookingStatus as any,
				paymentStatus: paymentStatus as any,
			});
			toast.success("Status diperbarui");
		} catch {
			toast.error("Gagal memperbarui status");
		}
	};

	const handleSaveCapacity = async () => {
		if (!capDate || capValue === "") {
			toast.error("Isi tanggal dan kapasitas");
			return;
		}
		setIsSavingCap(true);
		try {
			await setDateCapacity({
				slug: "booking",
				date: capDate,
				maxCapacity: Number(capValue),
				notes: capNotes || undefined,
			});
			toast.success(`Kapasitas ${capValue} orang untuk ${formatDate(capDate)} disimpan`);
			setCapValue("");
			setCapNotes("");
		} catch {
			toast.error("Gagal menyimpan kapasitas");
		} finally {
			setIsSavingCap(false);
		}
	};

	const tabs = [
		{ id: "calendar", label: "Kalender", icon: Calendar },
		{ id: "orders", label: "Daftar Booking", icon: List },
		{ id: "capacity", label: "Kapasitas", icon: Users },
		{ id: "general", label: "Tampilan", icon: Smartphone },
		{ id: "products", label: "Produk", icon: ShoppingBag },
		{ id: "payment", label: "Pembayaran", icon: Globe },
	] as const;

	const filteredOrders = allOrders?.filter((o) => {
		if (listFilter === "all") return true;
		return o.bookingStatus === listFilter;
	});

	return (
		<div className="mx-auto max-w-5xl space-y-4 md:space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-bold text-foreground text-xl tracking-tight md:text-2xl">
						Manajemen Booking
					</h2>
					<p className="mt-0.5 text-muted-foreground text-xs">
						Kelola reservasi dan pengaturan halaman booking online
					</p>
				</div>
				<div className="flex gap-2">
					<a
						className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 font-medium text-foreground text-sm hover:bg-muted transition-colors"
						href="/booking"
						rel="noreferrer"
						target="_blank"
					>
						<LinkIcon className="h-4 w-4" /> Buka Halaman
					</a>
					{(activeTab === "general" || activeTab === "products" || activeTab === "payment") && (
						<button
							className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 font-bold text-primary-foreground text-sm hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
							disabled={isSaving}
							onClick={handleSave}
							type="button"
						>
							{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
							{isSaving ? "Menyimpan..." : "Simpan"}
						</button>
					)}
				</div>
			</div>

			{/* Tabs */}
			<div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
				{tabs.map((tab) => (
					<button
						className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 font-bold text-xs transition-all md:px-4 md:text-sm ${
							activeTab === tab.id
								? "bg-card text-primary shadow-sm"
								: "text-muted-foreground hover:bg-card/50 hover:text-foreground"
						}`}
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						type="button"
					>
						<tab.icon className="h-4 w-4" />
						{tab.label}
					</button>
				))}
			</div>

			{/* ── CALENDAR TAB ── */}
			{activeTab === "calendar" && (
				<div className="space-y-4">
					<AdminCalendar
						month={calMonth}
						onDayClick={(date) => {
							setSelectedDate(date === selectedDate ? null : date);
						}}
						onNavigate={(y, m) => {
							setCalYear(y);
							setCalMonth(m);
						}}
						selectedDate={selectedDate}
						summary={summary ?? {}}
						year={calYear}
					/>

					{selectedDate && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<h3 className="font-bold text-foreground">
									Booking — {formatDate(selectedDate)}
								</h3>
								<button
									className="text-muted-foreground text-xs hover:text-foreground"
									onClick={() => setSelectedDate(null)}
									type="button"
								>
									<X className="h-4 w-4" />
								</button>
							</div>
							{!allOrders ? (
								<div className="flex justify-center py-8">
									<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
								</div>
							) : allOrders.length === 0 ? (
								<div className="rounded-xl border border-border bg-card py-10 text-center text-muted-foreground text-sm">
									Belum ada booking pada tanggal ini.
								</div>
							) : (
								<div className="space-y-2">
									{allOrders.map((order: any) => (
										<OrderRow
											key={order._id}
											order={order}
											onUpdateStatus={handleUpdateStatus}
										/>
									))}
								</div>
							)}
						</div>
					)}

					{!selectedDate && (
						<div className="rounded-xl border border-border bg-muted/30 py-8 text-center text-muted-foreground text-sm">
							Klik tanggal pada kalender untuk melihat detail booking
						</div>
					)}
				</div>
			)}

			{/* ── ORDERS TAB ── */}
			{activeTab === "orders" && (
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-2">
						{(["all", "pending", "confirmed", "cancelled"] as const).map((f) => (
							<button
								className={`rounded-full px-4 py-1.5 font-bold text-xs transition-all ${
									listFilter === f
										? "bg-primary text-primary-foreground"
										: "bg-muted text-muted-foreground hover:bg-muted/80"
								}`}
								key={f}
								onClick={() => setListFilter(f)}
								type="button"
							>
								{f === "all" ? "Semua" : STATUS_LABEL[f]}
							</button>
						))}
						{allOrders && (
							<span className="ml-auto text-muted-foreground text-xs">
								{filteredOrders?.length ?? 0} booking
							</span>
						)}
					</div>

					{!allOrders ? (
						<div className="flex justify-center py-12">
							<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
						</div>
					) : filteredOrders?.length === 0 ? (
						<div className="rounded-xl border border-border bg-card py-14 text-center text-muted-foreground text-sm">
							Belum ada booking.
						</div>
					) : (
						<div className="space-y-2">
							{filteredOrders?.map((order: any) => (
								<OrderRow
									key={order._id}
									order={order}
									onUpdateStatus={handleUpdateStatus}
								/>
							))}
						</div>
					)}
				</div>
			)}

			{/* ── CAPACITY TAB ── */}
			{activeTab === "capacity" && (
				<div className="space-y-6">
					{/* Add/edit capacity form */}
					<section className="rounded-2xl border border-border bg-card p-5 space-y-4">
						<div className="flex items-center gap-2">
							<Settings2 className="h-4 w-4 text-primary" />
							<h3 className="font-bold">Atur Kapasitas Per Tanggal</h3>
						</div>
						<p className="text-muted-foreground text-sm">
							Tentukan maksimal jumlah booking yang diizinkan untuk tanggal tertentu.
							Isi <span className="font-bold">0</span> untuk kapasitas tidak terbatas.
						</p>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div className="space-y-1.5">
								<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest" htmlFor="cap-date">
									Tanggal
								</label>
								<input
									className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
									id="cap-date"
									min={todayStr()}
									onChange={(e) => setCapDate(e.target.value)}
									type="date"
									value={capDate}
								/>
							</div>
							<div className="space-y-1.5">
								<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest" htmlFor="cap-value">
									Kapasitas (orang)
								</label>
								<input
									className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
									id="cap-value"
									min="0"
									onChange={(e) => setCapValue(e.target.value)}
									placeholder="Contoh: 10"
									type="number"
									value={capValue}
								/>
							</div>
							<div className="space-y-1.5">
								<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest" htmlFor="cap-notes">
									Catatan (opsional)
								</label>
								<input
									className="w-full rounded-xl bg-muted/50 p-3 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
									id="cap-notes"
									onChange={(e) => setCapNotes(e.target.value)}
									placeholder="Contoh: Event khusus"
									value={capNotes}
								/>
							</div>
						</div>
						<button
							className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground text-sm hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
							disabled={isSavingCap}
							onClick={handleSaveCapacity}
							type="button"
						>
							{isSavingCap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
							Simpan Kapasitas
						</button>
					</section>

					{/* Existing capacities list */}
					<div className="space-y-2">
						<h3 className="font-bold text-sm">Kapasitas yang Telah Diatur</h3>
						{!dateCapacities ? (
							<div className="flex justify-center py-6">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : dateCapacities.length === 0 ? (
							<div className="rounded-xl border border-border bg-card py-8 text-center text-muted-foreground text-sm">
								Belum ada kapasitas yang diatur.
							</div>
						) : (
							<div className="rounded-xl border border-border bg-card overflow-hidden">
								<table className="w-full text-sm">
									<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
										<tr>
											<th className="px-4 py-3 text-left">Tanggal</th>
											<th className="px-4 py-3 text-center">Kapasitas</th>
											<th className="px-4 py-3 text-left">Catatan</th>
											<th className="px-4 py-3 text-right">Aksi</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{dateCapacities
											.sort((a: any, b: any) => a.date.localeCompare(b.date))
											.map((cap: any) => (
												<tr className="hover:bg-muted/30" key={cap._id}>
													<td className="px-4 py-3 font-medium">{formatDate(cap.date)}</td>
													<td className="px-4 py-3 text-center">
														<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-bold text-primary text-xs">
															<Users className="h-3 w-3" />
															{cap.maxCapacity === 0 ? "∞" : cap.maxCapacity}
														</span>
													</td>
													<td className="px-4 py-3 text-muted-foreground text-xs">
														{cap.notes || "—"}
													</td>
													<td className="px-4 py-3 text-right">
														<button
															className="text-xs text-muted-foreground hover:text-foreground"
															onClick={() => {
																setCapDate(cap.date);
																setCapValue(String(cap.maxCapacity));
																setCapNotes(cap.notes || "");
															}}
															type="button"
														>
															Edit
														</button>
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── GENERAL SETTINGS TAB ── */}
			{activeTab === "general" && (
				<section className="space-y-5 rounded-2xl border border-border bg-card p-5 md:p-8">
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div className="space-y-1.5">
							<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest" htmlFor="page-title">
								Judul Halaman
							</label>
							<input
								className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
								id="page-title"
								onChange={(e) => setFormData({ ...formData, title: e.target.value })}
								placeholder="Djiwa Tentram Cafe"
								value={formData.title}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">
								Slug URL
							</label>
							<div className="flex items-center rounded-xl bg-muted/50 px-3">
								<span className="text-muted-foreground text-sm">/</span>
								<input
									className="w-full bg-transparent p-3.5 font-medium text-foreground outline-none"
									disabled
									value={formData.slug}
								/>
							</div>
						</div>
						<div className="space-y-1.5 md:col-span-2">
							<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest" htmlFor="page-desc">
								Deskripsi / Bio
							</label>
							<textarea
								className="min-h-[90px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
								id="page-desc"
								onChange={(e) => setFormData({ ...formData, description: e.target.value })}
								placeholder="Deskripsi singkat bisnis anda..."
								value={formData.description}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">
								Warna Tema
							</label>
							<div className="flex items-center gap-3">
								<input
									className="h-10 w-14 cursor-pointer rounded-lg border border-border"
									onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
									type="color"
									value={formData.themeColor}
								/>
								<span className="font-mono text-sm">{formData.themeColor}</span>
							</div>
						</div>
						<div className="space-y-1.5">
							<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">
								Status Halaman
							</label>
							<div className="flex items-center gap-3">
								<button
									className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.isActive ? "bg-primary" : "bg-muted"}`}
									onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
									type="button"
								>
									<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isActive ? "translate-x-6" : "translate-x-1"}`} />
								</button>
								<span className="text-sm font-medium">{formData.isActive ? "Aktif" : "Nonaktif"}</span>
							</div>
						</div>
					</div>
				</section>
			)}

			{/* ── PRODUCTS TAB ── */}
			{activeTab === "products" && (
				<section className="rounded-2xl border border-border bg-card p-5 md:p-8 space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="font-bold">Pilih Produk yang Ditampilkan</h3>
						<Badge variant="secondary">{formData.featuredProductIds.length} dipilih</Badge>
					</div>
					<p className="text-muted-foreground text-sm">
						Pilih produk yang tampil di halaman booking. Kosongkan untuk tampilkan semua.
					</p>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{allProducts?.map((product: any) => (
							<button
								className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
									formData.featuredProductIds.includes(product._id)
										? "border-primary bg-primary/5 ring-1 ring-primary"
										: "border-border hover:bg-muted/50"
								}`}
								key={product._id}
								onClick={() => {
									const isSelected = formData.featuredProductIds.includes(product._id);
									setFormData({
										...formData,
										featuredProductIds: isSelected
											? formData.featuredProductIds.filter((id) => id !== product._id)
											: [...formData.featuredProductIds, product._id],
									});
								}}
								type="button"
							>
								<div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
									{product.image ? (
										<img alt={product.name} className="h-full w-full object-cover" src={product.image} />
									) : (
										<div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground text-lg">
											{product.name.charAt(0)}
										</div>
									)}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-bold text-sm">{product.name}</p>
									<p className="text-muted-foreground text-xs">
										Rp {product.price.toLocaleString("id-ID")}
									</p>
								</div>
								{formData.featuredProductIds.includes(product._id) && (
									<Check className="h-4 w-4 text-primary shrink-0" />
								)}
							</button>
						))}
					</div>
				</section>
			)}

			{/* ── PAYMENT TAB ── */}
			{activeTab === "payment" && (
				<section className="rounded-2xl border border-border bg-card p-5 md:p-8 space-y-6">
					<div className="space-y-3">
						<h3 className="font-bold text-sm">Metode Pembayaran</h3>
						<div className="flex flex-wrap gap-3">
							{[
								{ id: "qris", label: "QRIS" },
								{ id: "bank_transfer", label: "Transfer Bank" },
								{ id: "cash", label: "Cash / Tunai" },
							].map(({ id, label }) => (
								<label
									className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 hover:bg-muted/50 transition-colors"
									key={id}
								>
									<input
										checked={formData.paymentMethods.includes(id)}
										className="accent-primary"
										onChange={(e) => {
											const newMethods = e.target.checked
												? [...formData.paymentMethods, id]
												: formData.paymentMethods.filter((m) => m !== id);
											setFormData({ ...formData, paymentMethods: newMethods });
										}}
										type="checkbox"
									/>
									<span className="font-medium text-sm">{label}</span>
								</label>
							))}
						</div>
					</div>
					<div className="space-y-1.5">
						<label className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest" htmlFor="bank-details">
							Detail Rekening / Instruksi Pembayaran
						</label>
						<textarea
							className="min-h-[110px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/20"
							id="bank-details"
							onChange={(e) => setFormData({ ...formData, bankDetails: e.target.value })}
							placeholder="BCA 1234567890 a.n Djiwa Tentram&#10;Konfirmasi via WhatsApp setelah transfer"
							value={formData.bankDetails}
						/>
					</div>
				</section>
			)}
		</div>
	);
}
