import { Link } from "@tanstack/react-router";
import { CalendarDays, CircleAlert, Clock3, Gauge, Plus, RefreshCw, Users } from "lucide-react";
import { useMemo } from "react";
import { useHybridBookingDateCapacities, useHybridBookingOrdersState, useHybridBookingSettings } from "@/hooks/use-hybrid-booking-data";

function localDateInput() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatRupiah(value: number) {
	return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

const statusLabels: Record<string, string> = {
	pending: "Menunggu konfirmasi",
	confirmed: "Confirmed",
	arrived: "Sudah tiba",
	seated: "Sudah duduk",
	completed: "Selesai",
	cancelled: "Dibatalkan",
	no_show: "No-show",
};

export function BookingOverviewPage() {
	const today = localDateInput();
	const settings = useHybridBookingSettings("booking");
	const capacities = useHybridBookingDateCapacities("booking");
	const ordersState = useHybridBookingOrdersState({ slug: "booking", date: today });
	const orders = ordersState.data ?? [];
	const todayCapacity = capacities?.find((item: any) => item.date === today);
	const maxPeople = Number(todayCapacity?.maxPeople ?? settings?.defaultMaxPeople ?? 0);
	const maxTables = Number(todayCapacity?.maxTables ?? settings?.defaultMaxTables ?? 0);

	const { metrics, attentionQueue, nextBookings } = useMemo(() => {
		const active = orders.filter((order: any) => !["cancelled", "expired", "no_show"].includes(String(order.bookingStatus)));
		const attention = active
			.filter((order: any) => order.bookingStatus === "pending" || order.paymentStatus !== "paid")
			.sort((a: any, b: any) => String(a.arrivalTime ?? "99:99").localeCompare(String(b.arrivalTime ?? "99:99")))
			.slice(0, 5);
		const agenda = active
			.filter((order: any) => !["completed"].includes(String(order.bookingStatus)))
			.sort((a: any, b: any) => String(a.arrivalTime ?? "99:99").localeCompare(String(b.arrivalTime ?? "99:99")))
			.slice(0, 5);
		return {
			metrics: {
				bookings: active.length,
				guests: active.reduce((sum: number, order: any) => sum + Number(order.guestCount ?? 0), 0),
				pending: active.filter((order: any) => order.bookingStatus === "pending").length,
				unpaid: active.filter((order: any) => order.paymentStatus !== "paid").length,
			},
			attentionQueue: attention,
			nextBookings: agenda,
		};
	}, [orders]);

	const isLoading = ordersState.status === "loading";
	const hasError = ordersState.status === "error";

	return (
		<div className="mx-auto max-w-7xl space-y-5 pb-10">
			<header className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
				<div>
					<p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Booking workspace</p>
					<h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">Dashboard Booking</h1>
					<p className="mt-1 text-sm text-muted-foreground">Prioritas operasional untuk {formatDate(today)}.</p>
				</div>
				<Link className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[.98] md:self-auto" to="/admin/booking/orders">
					<Plus className="h-4 w-4" /> Tambah booking
				</Link>
			</header>

			{hasError && (
				<div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm md:flex-row md:items-center md:justify-between">
					<div><p className="font-semibold text-destructive">Data booking belum berhasil dimuat.</p><p className="mt-1 text-xs text-muted-foreground">Coba muat ulang untuk melihat kondisi terbaru.</p></div>
					<button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-destructive/30 px-3 text-xs font-semibold text-destructive hover:bg-destructive/10" onClick={() => void ordersState.reload()} type="button"><RefreshCw className="h-3.5 w-3.5" /> Coba lagi</button>
				</div>
			)}

			<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indikator keputusan booking hari ini">
				<MetricCard icon={<CalendarDays />} label="Booking hari ini" value={isLoading ? "—" : metrics.bookings} tone="blue" />
				<MetricCard icon={<Users />} label="Tamu terjadwal" value={isLoading ? "—" : `${metrics.guests}${maxPeople ? ` / ${maxPeople}` : ""}`} tone="violet" />
				<MetricCard icon={<CircleAlert />} label="Menunggu konfirmasi" value={isLoading ? "—" : metrics.pending} tone="amber" />
				<MetricCard icon={<Clock3 />} label="Belum lunas" value={isLoading ? "—" : metrics.unpaid} tone="rose" />
			</section>

			<div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
				<section className="rounded-3xl border border-border/70 bg-card shadow-sm">
					<div className="flex items-center justify-between border-border/70 border-b px-5 py-4">
						<div><h2 className="font-display text-base font-bold">Perlu perhatian</h2><p className="mt-0.5 text-xs text-muted-foreground">Booking yang membutuhkan tindak lanjut operator</p></div>
					</div>
					{isLoading ? <QueueSkeleton /> : attentionQueue.length === 0 ? <EmptyAttention /> : <div className="divide-y divide-border/70">{attentionQueue.map((order: any) => <AttentionRow key={order._id} order={order} />)}</div>}
				</section>

				<div className="space-y-5">
					<section className="rounded-3xl border border-border/70 bg-card shadow-sm">
						<div className="flex items-center justify-between border-border/70 border-b px-5 py-4"><div><h2 className="font-display text-base font-bold">Agenda berikutnya</h2><p className="mt-0.5 text-xs text-muted-foreground">Urutan kedatangan hari ini</p></div><Clock3 className="h-5 w-5 text-primary" /></div>
						{isLoading ? <QueueSkeleton /> : nextBookings.length === 0 ? <div className="px-5 py-10 text-center text-xs text-muted-foreground">Belum ada kedatangan terjadwal.</div> : <div className="divide-y divide-border/70">{nextBookings.map((order: any) => <BookingRow key={order._id} order={order} />)}</div>}
					</section>

					<section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
						<div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-base font-bold">Kapasitas tamu</h2><p className="mt-0.5 text-xs text-muted-foreground">Konteks kapasitas untuk tanggal aktif</p></div><Gauge className="h-5 w-5 text-primary" /></div>
						<ProgressLine value={metrics.guests} max={maxPeople} />
						<p className="mt-3 text-xs text-muted-foreground">{maxTables ? `${maxTables} meja tersedia sebagai batas operasional.` : "Batas meja belum dikonfigurasi."}</p>
					</section>
				</div>
			</div>
		</div>
	);
}

function QueueSkeleton() { return <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div className="h-14 animate-pulse rounded-2xl bg-muted" key={item} />)}</div>; }

function EmptyAttention() { return <div className="flex flex-col items-center px-5 py-12 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600"><CircleAlert className="h-6 w-6" /></div><h3 className="font-display text-sm font-bold">Tidak ada tindakan mendesak</h3><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Semua booking hari ini sudah berada dalam alur yang aman.</p></div>; }

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: "blue" | "violet" | "amber" | "rose" }) {
	const tones = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-700" };
	return <article className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"><div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-extrabold tracking-tight">{value}</p></article>;
}

function AttentionRow({ order }: { order: any }) {
	const reason = order.bookingStatus === "pending" ? "Menunggu konfirmasi" : "Pembayaran belum lunas";
	return <Link className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/40" to="/admin/booking/orders"><div className="min-w-0"><p className="truncate text-sm font-bold">{order.customerName || "Customer"}</p><p className="mt-1 text-xs text-muted-foreground">{order.arrivalTime || "Jam belum diatur"} · {order.guestCount ?? 0} tamu</p></div><div className="shrink-0 text-right"><span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700">{reason}</span><p className="mt-1 text-xs font-semibold text-muted-foreground">{statusLabels[order.bookingStatus] || order.bookingStatus || "Pending"}</p></div></Link>;
}

function BookingRow({ order }: { order: any }) {
	return <Link className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/40" to="/admin/booking/orders"><div className="min-w-0"><p className="truncate text-sm font-bold">{order.customerName || "Customer"}</p><p className="mt-1 text-xs text-muted-foreground">{order.arrivalTime || "Jam belum diatur"} · {order.guestCount ?? 0} tamu</p></div><div className="shrink-0 text-right"><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{statusLabels[order.bookingStatus] || order.bookingStatus || "Pending"}</span><p className="mt-1 text-xs font-semibold text-muted-foreground">{formatRupiah(Number(order.totalAmount ?? 0))}</p></div></Link>;
}

function ProgressLine({ value, max }: { value: number; max: number }) {
	const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
	return <div className="mt-5"><div className="mb-1.5 flex justify-between text-xs"><span className="font-semibold">Tamu terjadwal</span><span className="text-muted-foreground">{value} / {max || "—"}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div></div>;
}
