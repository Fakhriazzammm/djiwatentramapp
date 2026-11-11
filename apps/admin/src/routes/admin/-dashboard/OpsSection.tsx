import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import type { AdminOverview, Source } from "@/hooks/use-admin-overview";
import type { AttendancePayload, AttendanceStatus, FeedEvent, RecentOrderRow } from "@/lib/dashboard-analytics";
import { GrowBar, LiveDot } from "./motion";
import { APP_COLOR, Card, Empty, formatAgo, formatClockWIB, Label, Masked, SectionTitle, SourceError, Skeleton, useRupiah } from "./ui";
import { labelChannel } from "./PaymentsSection";

function valueOf<T>(source: Source<T>): T | null {
	return source.ok ? source.value : null;
}

const STATUS_STYLE: Record<AttendanceStatus, { label: string; text: string; bg: string }> = {
	working: { label: "Bekerja", text: "#166534", bg: "#e8f5ee" },
	done: { label: "Sudah pulang", text: "#2f5d9e", bg: "#eaf3ff" },
	leave: { label: "Izin / cuti", text: "#7a4b00", bg: "#fff8e6" },
	absent: { label: "Belum hadir", text: "#b42318", bg: "#fdecea" },
};

const LEAVE_LABEL: Record<string, string> = { izin: "Izin", cuti: "Cuti", sakit: "Sakit", other: "Lainnya" };

export function OpsSection({ overview, periodLabel }: { overview: AdminOverview; periodLabel: string }) {
	return (
		<div>
			<SectionTitle color="#16a34a" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">hari ini · WIB</span>}>
				Tim, stok &amp; tindakan
			</SectionTitle>
			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
				<AttendanceCard overview={overview} />
				<ActionsCard overview={overview} />
				<RecentOrdersCard overview={overview} periodLabel={periodLabel} />
			</div>
		</div>
	);
}

export function AttendanceCard({ overview }: { overview: AdminOverview }) {
	const payload = valueOf(overview.attendance);
	const error = overview.attendance.ok ? null : overview.attendance.error;
	return (
		<Card ariaLabel="Kehadiran tim" label={<Label tone="green">Kehadiran tim · nama staf</Label>}>
			{error ? <SourceError message={error} /> : !payload ? <Skeleton className="h-64 w-full" /> : <AttendanceBody payload={payload} />}
		</Card>
	);
}

function AttendanceBody({ payload }: { payload: AttendancePayload }) {
	const ratio = payload.total ? payload.present / payload.total : 0;
	const order: Record<AttendanceStatus, number> = { working: 0, done: 1, leave: 2, absent: 3 };
	const staff = [...payload.staff].sort((left, right) => order[left.status] - order[right.status] || (left.name ?? "").localeCompare(right.name ?? "", "id"));
	return (
		<div>
			<div className="flex items-baseline gap-2">
				<span className="font-display text-[30px] font-semibold leading-none tabular-nums text-[#111114]"><Masked>{payload.present}</Masked></span>
				<span className="font-mono text-[11px] text-[#666672]">dari <Masked>{payload.total}</Masked> staf aktif hadir</span>
			</div>
			<div className="mt-3 h-1.5 overflow-hidden bg-[#ececf0]">
				<GrowBar ratio={ratio} className="h-full bg-[#16a34a]" />
			</div>
			{staff.length === 0 ? (
				<div className="mt-4"><Empty>Belum ada data staf aktif.</Empty></div>
			) : (
				<ul className="mt-4 max-h-[320px] divide-y divide-[#efeff2] overflow-y-auto pr-1" aria-label="Daftar staf dan status kehadiran">
					{staff.map((person) => {
						const style = STATUS_STYLE[person.status];
						const detail =
							person.status === "working" && person.checkInAt
								? `masuk ${formatClockWIB(person.checkInAt)}`
								: person.status === "done" && person.checkInAt && person.checkOutAt
									? `${formatClockWIB(person.checkInAt)} – ${formatClockWIB(person.checkOutAt)}`
									: person.status === "leave"
										? LEAVE_LABEL[person.leaveType ?? ""] ?? "Izin"
										: "";
						return (
							<li key={person.userId} className="flex items-center gap-3 py-2.5">
								<span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#111114] font-mono text-[12px] font-semibold text-white">
									{(person.name ?? "").trim().charAt(0).toUpperCase() || "?"}
								</span>
								<div className="min-w-0 flex-1">
									<div className="truncate text-[13px] font-semibold text-[#111114]"><Masked>{person.name || "Tanpa nama"}</Masked></div>
									<div className="truncate font-mono text-[10px] text-[#666672]">
										{person.role ?? "Staf"}{detail ? ` · ${detail}` : ""}
									</div>
								</div>
								<span className="shrink-0 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: style.text, background: style.bg }}>
									{style.label}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

export function ActionsCard({ overview }: { overview: AdminOverview }) {
	const payload = valueOf(overview.actions);
	const error = overview.actions.ok ? null : overview.actions.error;
	const items: Array<{ key: string; href: string; count: number; text: string; tone: string }> = payload
		? [
				...(payload.stockCritical > 0
					? [{ key: "stock", href: "/admin/inventory", count: payload.stockCritical, text: "bahan stok kritis perlu dibeli ulang", tone: "#b7791f" }]
					: []),
				...(payload.pendingOverFifteen > 0
					? [{ key: "pending", href: "/admin/orders", count: payload.pendingOverFifteen, text: "pesanan menunggu pembayaran lebih dari 15 menit", tone: "#d92d20" }]
					: []),
			]
		: [];
	return (
		<Card ariaLabel="Perlu tindakan" label={<Label tone="red">Perlu tindakan</Label>}>
			{error ? (
				<SourceError message={error} />
			) : !payload ? (
				<Skeleton className="h-48 w-full" />
			) : items.length === 0 ? (
				<div className="flex items-center gap-2 bg-[#eaf8ef] p-3 text-[12px] text-[#166534]">
					<CheckCircle2 className="h-4 w-4" aria-hidden="true" />
					Tidak ada tindakan kritis saat ini.
				</div>
			) : (
				<ul className="space-y-2">
					{items.map((item) => (
						<li key={item.key}>
							<Link to={item.href} className="group flex items-center gap-3 border border-[#efeff2] p-3 transition-colors duration-200 hover:border-[#d8d8de] hover:bg-[#fafafc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114]">
								<span className="font-display text-[22px] font-semibold tabular-nums" style={{ color: item.tone }}>{item.count}</span>
								<span className="min-w-0 flex-1 text-[12px] text-[#111114]">{item.text}</span>
								<ChevronRight className="h-4 w-4 text-[#aeaeb2] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
							</Link>
						</li>
					))}
				</ul>
			)}
			{payload && payload.stockItems.length > 0 && (
				<div className="mt-4">
					<Label>Bahan paling kritis</Label>
					<ul className="mt-2 space-y-1.5 font-mono text-[11px] text-[#444450]">
						{payload.stockItems.map((row) => (
							<li key={row.name} className="flex justify-between gap-2">
								<span className="truncate">{row.name}</span>
								<span className="shrink-0 tabular-nums">{row.quantity} / min {row.threshold}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</Card>
	);
}

function displayNumber(order: RecentOrderRow) {
	return getDisplayOrderNumber(order.orderNumber, {
		sequence: order.dailyReceiptNo,
		createdAt: order.createdAt,
		source: order.source,
		sourceApp: order.sourceApp,
		businessUnit: order.businessUnit,
		orderType: order.orderType,
		brandSlug: order.brandSlug,
	});
}

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
	paid: { label: "Dibayar", color: "#2f5d9e" },
	completed: { label: "Selesai", color: "#166534" },
	pending: { label: "Menunggu", color: "#b7791f" },
	cancelled: { label: "Batal", color: "#666672" },
};

function RecentOrdersCard({ overview, periodLabel }: { overview: AdminOverview; periodLabel: string }) {
	const breakdown = valueOf(overview.breakdown);
	const error = overview.breakdown.ok ? null : overview.breakdown.error;
	const rupiah = useRupiah();
	return (
		<Card
			ariaLabel="Pesanan terbaru"
			label={<Label tone="ink">Pesanan terbaru · {periodLabel.toLowerCase()}</Label>}
			action={<Link to="/admin/orders" className="font-mono text-[10px] font-semibold text-[#2f5d9e] hover:underline">Buka order</Link>}
		>
			{error ? (
				<SourceError message={error} />
			) : !breakdown ? (
				<Skeleton className="h-64 w-full" />
			) : breakdown.recentOrders.length === 0 ? (
				<Empty>Belum ada pesanan pada periode ini.</Empty>
			) : (
				<ul className="divide-y divide-[#efeff2]">
					{breakdown.recentOrders.map((order) => {
						const status = ORDER_STATUS[order.status] ?? { label: order.status, color: "#666672" };
						return (
							<li key={order.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[12px]">
								<span className="font-mono text-[10px] text-[#8e8e93]">{formatClockWIB(order.createdAt)}</span>
								<div className="min-w-0">
									<div className="truncate font-mono text-[12px] font-semibold text-[#111114]"><Masked>{displayNumber(order)}</Masked></div>
									<div className="truncate font-mono text-[10px] text-[#666672]">
										{labelChannel(order.orderChannel ?? "unknown")} · {order.itemCount} item · <span style={{ color: status.color }}>{status.label}</span>
									</div>
								</div>
								<span className="font-mono text-[11px] font-semibold tabular-nums"><Masked>{rupiah(order.totalAmount)}</Masked></span>
							</li>
						);
					})}
				</ul>
			)}
		</Card>
	);
}

export function describeEvent(event: FeedEvent, rupiah: (value: number) => string) {
	switch (event.kind) {
		case "order": {
			const status: Record<string, string> = {
				paid: "sudah dibayar",
				completed: "selesai",
				pending: "menunggu pembayaran",
				cancelled: "dibatalkan",
			};
			return `Pesanan ${event.name} ${status[event.status] ?? event.status} · ${rupiah(event.amount)}`;
		}
		case "attendance":
			return `${event.name} ${event.status === "check_in" ? "clock-in" : "clock-out"}`;
		case "wallet": {
			const sign = event.detail === "credit" ? "+" : "−";
			return `${event.name} · ${sign}${rupiah(event.amount)}`;
		}
		case "donation":
			return `${event.name} · ${event.detail ?? 0} porsi dibayar · ${rupiah(event.amount)}`;
		case "booking": {
			const status = event.status === "confirmed" ? "dikonfirmasi" : event.status;
			return `Reservasi ${event.name} · ${event.detail ?? 0} orang · ${status}`;
		}
		default:
			return event.name;
	}
}

export function LiveFeed({ events, now }: { events: FeedEvent[]; now: number }) {
	const rupiah = useRupiah();
	const reduceMotion = useReducedMotion();
	if (events.length === 0) return <Empty>Belum ada aktivitas terbaru.</Empty>;
	return (
		<ul aria-live="polite" aria-label="Aktivitas langsung dari semua aplikasi" className="mt-1">
			<AnimatePresence initial={false}>
				{events.map((event, index) => (
					<motion.li
						layout={!reduceMotion}
						key={`${event.at}-${event.kind}-${event.name}-${index}`}
						initial={reduceMotion ? false : { opacity: 0, x: -14, backgroundColor: "#eef4ff" }}
						animate={{ opacity: 1, x: 0, backgroundColor: "rgba(238,244,255,0)" }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
						className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-[#efeff2] px-1.5 py-2 text-[12px]"
					>
						<span className="w-[92px] shrink-0 font-mono text-[10px] font-semibold tracking-[0.06em]" style={{ color: APP_COLOR[event.app] ?? "#475569" }}>
							{event.app}
						</span>
						<span className="min-w-0 flex-1 text-[#111114]"><Masked>{describeEvent(event, rupiah)}</Masked></span>
						<span className="font-mono text-[10px] text-[#8e8e93]">{formatAgo(event.at, now)}</span>
					</motion.li>
				))}
			</AnimatePresence>
		</ul>
	);
}

export function LiveHeader({ updatedLabel, count }: { updatedLabel: string; count: number }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<Label tone="ink" className="flex items-center gap-2">
				<LiveDot />
				Aktivitas langsung · semua aplikasi
			</Label>
			<span className="font-mono text-[10px] text-[#8e8e93]">{updatedLabel} · {count} kejadian</span>
		</div>
	);
}

