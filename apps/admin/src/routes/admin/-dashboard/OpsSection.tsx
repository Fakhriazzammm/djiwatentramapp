import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminProtectedRead } from "@/lib/admin-protected-read";
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
			<div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
				<RecentOrdersCard key={overview.range.key} overview={overview} periodLabel={periodLabel} pending={overview.range.label !== periodLabel} />
				<AttendanceCard overview={overview} />
				<ActionsCard overview={overview} />
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


const ORDERS_PAGE_SIZE = 30;
const orderDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
type ProtectedOrder = {
  _id: string; orderNumber: string | null; daily_receipt_no: number | null;
  status: string; totalAmount: number; createdAt: number; orderChannel: string | null;
  paymentMethod: string | null; orderType: string | null; brandSlug: string | null;
  businessUnit: string | null; sourceApp: string | null; source: string | null;
  items: unknown[] | null;
};
function orderChannel(row: ProtectedOrder): string {
  if (row.orderChannel) return row.orderChannel;
  const source = (row.source ?? "").toLowerCase();
  const app = (row.sourceApp ?? "").toLowerCase();
  const unit = (row.businessUnit ?? "").toLowerCase();
  if (source === "booking") return "booking";
  if (unit === "ordermieyamin" || unit === "mieyamin" || source === "customer_self_service" || source === "djiwaapp") return "app";
  if (source === "gofood" || source === "go_food" || app.includes("gofood")) return "gofood";
  if (source === "grabfood" || source === "grab_food" || app.includes("grabfood")) return "grabfood";
  if (source === "shopeefood" || source === "shopee_food" || app.includes("shopeefood")) return "shopeefood";
  if (source.includes("telegram") || app.includes("telegram")) return "telegram";
  return !source || ["pos", "kasir", "internal"].includes(source) ? "pos" : "unknown";
}
function RecentOrdersCard({ overview, periodLabel, pending }: { overview: AdminOverview; periodLabel: string; pending: boolean }) {
  const rupiah = useRupiah();
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ProtectedOrder[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { start, end } = overview.range;
  const total = overview.breakdown.ok ? Object.values(overview.breakdown.value.statusCounts).reduce((sum, count) => sum + count, 0) : null;
  useEffect(() => { setPage(0); }, [start]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const offset = page * ORDERS_PAGE_SIZE;
    void adminProtectedRead<ProtectedOrder>("orders", {
      select: "_id,orderNumber,daily_receipt_no,status,totalAmount,createdAt,orderChannel,paymentMethod,orderType,brandSlug,businessUnit,sourceApp,source,items",
      gte: { createdAt: start }, lt: { createdAt: end },
      order: [{ column: "createdAt", ascending: false }, { column: "_id", ascending: false }],
      range: [offset, offset + ORDERS_PAGE_SIZE],
    }).then((result) => {
      if (cancelled) return;
      setRows(result.slice(0, ORDERS_PAGE_SIZE)); setHasMore(result.length > ORDERS_PAGE_SIZE);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Gagal memuat pesanan");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [start, end, page, retry, overview.breakdown]);
  return (
    <Card ariaLabel="Pesanan terbaru" label={<Label tone="ink">Pesanan terbaru · {periodLabel.toLowerCase()}</Label>}
      action={<Link to="/admin/orders" className="font-mono text-[10px] font-semibold text-[#2f5d9e] hover:underline">Buka order</Link>}>
      {pending || (loading && rows.length === 0) ? <Skeleton className="h-64 w-full" /> : error ? (
        <div><SourceError message={error} /><button type="button" onClick={() => setRetry((n) => n + 1)} className="mt-2 text-xs underline">Coba lagi</button></div>
      ) : rows.length === 0 ? <Empty>Belum ada pesanan pada periode ini.</Empty> : (
        <ul className="max-h-[420px] overflow-y-auto divide-y divide-[#efeff2]">
          {rows.map((row) => {
            const status = ORDER_STATUS[row.status] ?? { label: row.status, color: "#666672" };
            const channel = orderChannel(row);
            const order: RecentOrderRow = { id: row._id, orderNumber: row.orderNumber, dailyReceiptNo: row.daily_receipt_no, status: row.status, totalAmount: Number(row.totalAmount), createdAt: Number(row.createdAt), orderChannel: channel, paymentMethod: row.paymentMethod, orderType: row.orderType, brandSlug: row.brandSlug, businessUnit: row.businessUnit, sourceApp: row.sourceApp, source: row.source, itemCount: Array.isArray(row.items) ? row.items.length : 0 };
            return <li key={row._id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[12px]">
              <span className="font-mono text-[10px] text-[#8e8e93]">{orderDateFormatter.format(order.createdAt)}</span>
              <div className="min-w-0"><div className="truncate font-mono text-[12px] font-semibold text-[#111114]"><Masked>{displayNumber(order)}</Masked></div>
              <div className="truncate font-mono text-[10px] text-[#666672]">{labelChannel(channel)} · {order.itemCount} item · <span style={{ color: status.color }}>{status.label}</span></div></div>
              <span className="font-mono text-[11px] font-semibold tabular-nums"><Masked>{rupiah(order.totalAmount)}</Masked></span>
            </li>;
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#efeff2] pt-3 font-mono text-[10px]">
        <div className="flex gap-1">
          <button type="button" disabled={page === 0 || loading || pending} onClick={() => { setRows([]); setPage(0); }} className="border px-2 py-2 disabled:opacity-40" aria-label="Halaman pertama">Awal</button>
          <button type="button" disabled={page === 0 || loading || pending} onClick={() => { setRows([]); setPage((n) => n - 1); }} className="border px-2 py-2 disabled:opacity-40">Sebelumnya</button>
        </div>
        <span aria-live="polite">Halaman {page + 1}{total !== null && <> / <Masked>{Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE))}</Masked> · <Masked>{total}</Masked> pesanan</>}</span>
        <div className="flex gap-1">
          <button type="button" disabled={!hasMore || loading || pending || !!error} onClick={() => { setRows([]); setPage((n) => n + 1); }} className="border px-2 py-2 disabled:opacity-40">Selanjutnya</button>
          <button type="button" disabled={total === null || page >= Math.ceil(total / ORDERS_PAGE_SIZE) - 1 || loading || pending || !!error} onClick={() => { if (total !== null) { setRows([]); setPage(Math.max(0, Math.ceil(total / ORDERS_PAGE_SIZE) - 1)); } }} className="border px-2 py-2 disabled:opacity-40" aria-label="Halaman terakhir">Akhir</button>
        </div>
      </div>
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
		<ul aria-live="polite" aria-label="Aktivitas langsung dari semua aplikasi" className="mt-1 max-h-[170px] overflow-y-auto overscroll-contain">
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

