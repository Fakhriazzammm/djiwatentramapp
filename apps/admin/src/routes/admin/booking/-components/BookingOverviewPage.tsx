import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, CircleAlert, Clock3, CreditCard, Gauge, Plus, RefreshCw, Users } from "lucide-react";
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

	const metrics = useMemo(() => {
		const active = orders.filter((order: any) => !["cancelled", "expired", "no_show"].includes(String(order.bookingStatus)));
		return {
			bookings: active.length,
			guests: active.reduce((sum: number, order: any) => sum + Number(order.guestCount ?? 0), 0),
			tables: active.reduce((sum: number, order: any) => sum + Number(order.tableCount ?? 0), 0),
			pendingPayment: active.filter((order: any) => order.paymentStatus !== "paid").length,
			attention: active.filter((order: any) => order.bookingStatus === "pending" || order.paymentStatus !== "paid").length,
		};
	}, [orders]);

	const nextBookings = [...orders]
		.filter((order: any) => !["cancelled", "completed", "no_show"].includes(String(order.bookingStatus)))
		.sort((a: any, b: any) => String(a.arrivalTime ?? "99:99").localeCompare(String(b.arrivalTime ?? "99:99")))
		.slice(0, 5);

	return (
		<div className="mx-auto max-w-7xl space-y-5 pb-10">
			<header className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
				<div>
					<p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Booking workspace</p>
					<h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">Dashboard Booking</h1>
					<p className="mt-1 text-sm text-muted-foreground">Ringkasan operasional untuk {formatDate(today)}.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted active:scale-[.98]" to="/admin/booking/calendar">
						<CalendarDays className="h-4 w-4" /> Kalender
					</Link>
					<Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[.98]" to="/admin/booking/orders">
						<Plus className="h-4 w-4" /> Tambah booking
					</Link>
				</div>
			</header>

			<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Ringkasan booking hari ini">
				<MetricCard icon={<CalendarDays />} label="Booking hari ini" value={ordersState.status === "loading" ? "—" : metrics.bookings} tone="blue" />
				<MetricCard icon={<Users />} label="Tamu terjadwal" value={ordersState.status === "loading" ? "—" : `${metrics.guests}${maxPeople ? ` / ${maxPeople}` : ""}`} tone="violet" />
				<MetricCard icon={<Gauge />} label="Meja terisi" value={ordersState.status === "loading" ? "—" : `${metrics.tables}${maxTables ? ` / ${maxTables}` : ""}`} tone="green" />
				<MetricCard icon={<CreditCard />} label="Belum lunas" value={ordersState.status === "loading" ? "—" : metrics.pendingPayment} tone="amber" />
				<MetricCard icon={<CircleAlert />} label="Perlu perhatian" value={ordersState.status === "loading" ? "—" : metrics.attention} tone="rose" />
			</section>

			<div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
				<section className="rounded-3xl border border-border/70 bg-card shadow-sm">
					<div className="flex items-center justify-between border-border/70 border-b px-5 py-4">
						<div>
							<h2 className="font-display text-base font-bold">Booking berikutnya</h2>
							<p className="mt-0.5 text-xs text-muted-foreground">Urutan kedatangan hari ini</p>
						</div>
						<Link className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-primary hover:bg-primary/10" to="/admin/booking/orders">Lihat semua <ArrowRight className="h-3.5 w-3.5" /></Link>
					</div>
					{ordersState.status === "loading" ? (
						<div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div className="h-14 animate-pulse rounded-2xl bg-muted" key={item} />)}</div>
					) : nextBookings.length === 0 ? (
						<div className="flex flex-col items-center px-5 py-14 text-center">
							<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarDays className="h-6 w-6" /></div>
							<h3 className="font-display text-sm font-bold">Belum ada booking hari ini</h3>
							<p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Hari ini masih tersedia untuk reservasi baru.</p>
							<Link className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground" to="/admin/booking/orders"><Plus className="h-3.5 w-3.5" /> Buat booking</Link>
						</div>
					) : (
						<div className="divide-y divide-border/70">{nextBookings.map((order: any) => <BookingRow key={order._id} order={order} />)}</div>
					)}
				</section>

				<aside className="space-y-5">
					<section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
						<div className="flex items-center justify-between"><div><h2 className="font-display text-base font-bold">Kapasitas hari ini</h2><p className="mt-0.5 text-xs text-muted-foreground">Terisi dibanding kapasitas</p></div><Gauge className="h-5 w-5 text-primary" /></div>
						<div className="mt-5 space-y-4"><ProgressLine label="Tamu" value={metrics.guests} max={maxPeople} /><ProgressLine label="Meja" value={metrics.tables} max={maxTables} /></div>
						<Link className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-border text-xs font-bold hover:bg-muted" to="/admin/booking/capacity">Kelola kapasitas <ArrowRight className="h-3.5 w-3.5" /></Link>
					</section>
					<section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
						<div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h2 className="font-display text-base font-bold">Akses cepat</h2></div>
						<div className="mt-4 grid gap-2"><QuickLink to="/admin/booking/calendar" label="Buka kalender" icon={<CalendarDays />} /><QuickLink to="/admin/booking/orders" label="Kelola data booking" icon={<Users />} /><QuickLink to="/admin/booking/capacity" label="Atur kapasitas" icon={<Gauge />} /></div>
					</section>
				</aside>
			</div>
		</div>
	);
}

function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: "blue" | "violet" | "green" | "amber" | "rose" }) {
	const tones = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-700" };
	return <article className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"><div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-extrabold tracking-tight">{value}</p></article>;
}

function BookingRow({ order }: { order: any }) {
	return <Link className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/40" to="/admin/booking/orders"><div className="min-w-0"><p className="truncate text-sm font-bold">{order.customerName || "Customer"}</p><p className="mt-1 text-xs text-muted-foreground">{order.arrivalTime || "Jam belum diatur"} · {order.guestCount ?? 0} tamu · {order.bookingCode || "Tanpa kode"}</p></div><div className="shrink-0 text-right"><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{statusLabels[order.bookingStatus] || order.bookingStatus || "Pending"}</span><p className="mt-1 text-xs font-semibold text-muted-foreground">{formatRupiah(Number(order.totalAmount ?? 0))}</p></div></Link>;
}

function ProgressLine({ label, value, max }: { label: string; value: number; max: number }) {
	const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
	return <div><div className="mb-1.5 flex justify-between text-xs"><span className="font-semibold">{label}</span><span className="text-muted-foreground">{value} / {max || "—"}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div></div>;
}

function QuickLink({ to, label, icon }: { to: "/admin/booking/calendar" | "/admin/booking/orders" | "/admin/booking/capacity"; label: string; icon: React.ReactNode }) {
	return <Link className="flex min-h-11 items-center justify-between rounded-xl border border-border/70 px-3 text-xs font-semibold transition hover:border-primary/30 hover:bg-primary/5" to={to}><span className="flex items-center gap-2"><span className="text-primary">{icon}</span>{label}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></Link>;
}
