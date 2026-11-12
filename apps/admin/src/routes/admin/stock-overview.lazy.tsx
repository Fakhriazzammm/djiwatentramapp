import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	AlertTriangle,
	ArrowDownLeft,
	ArrowUpRight,
	ClipboardList,
	RefreshCw,
	Boxes,
} from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Djiwa3DIcon } from "@yumipos/web-shared/components/ui/djiwa-3d-icon";
import { useHybridStockOverview } from "@/hooks/use-hybrid-inventory-admin-data";
import { cn } from "@/lib/utils";
import {
	buildStockOverviewAnalytics,
	getMovementDirection,
	getMovementLabel,
} from "./stock-overview-model";

export const Route = createLazyFileRoute("/admin/stock-overview")({
	component: StockOverviewPage,
});

const periods = [7, 30, 90] as const;

const numberFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

function formatQuantity(value: number) {
	return numberFormat.format(value);
}

function movementQuantity(movement: {
	type: string;
	quantity: number;
	unit: string;
}) {
	const direction = getMovementDirection(movement.type);
	const quantity = Math.abs(movement.quantity);
	const formatted = formatQuantity(quantity);
	const signed =
		direction === "incoming"
			? `+${formatted}`
			: direction === "outgoing"
				? `−${formatted}`
				: direction === "adjustment"
					? `${movement.quantity > 0 ? "+" : movement.quantity < 0 ? "−" : ""}${formatted}`
					: formatted;
	return `${signed}${movement.unit ? ` ${movement.unit}` : ""}`;
}

function directionTone(direction: ReturnType<typeof getMovementDirection>) {
	if (direction === "incoming") return "bg-emerald-50 text-emerald-700";
	if (direction === "outgoing") return "bg-rose-50 text-rose-700";
	if (direction === "adjustment") return "bg-sky-50 text-sky-700";
	return "bg-muted text-muted-foreground";
}

function StatusMetric({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone: "neutral" | "green" | "red" | "amber";
}) {
	const toneClass = {
		neutral: "bg-card",
		green: "bg-emerald-50/70",
		red: "bg-rose-50/70",
		amber: "bg-amber-50/70",
	}[tone];
	return (
		<div className={cn("rounded-2xl border border-border/70 p-4 shadow-sm", toneClass)}>
			<p className="text-xs font-medium text-muted-foreground">{label}</p>
			<p className="mt-2 text-2xl font-semibold tracking-tight">{numberFormat.format(value)}</p>
		</div>
	);
}

function MovementMetric({
	label,
	value,
	icon: Icon,
	tone,
}: {
	label: string;
	value: number;
	icon: typeof ArrowDownLeft;
	tone: "green" | "red" | "blue" | "neutral";
}) {
	const toneClass = {
		green: "bg-emerald-100 text-emerald-700",
		red: "bg-rose-100 text-rose-700",
		blue: "bg-sky-100 text-sky-700",
		neutral: "bg-muted text-muted-foreground",
	}[tone];
	return (
		<div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background p-3">
			<div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", toneClass)}>
				<Icon className="h-5 w-5" aria-hidden="true" />
			</div>
			<div className="min-w-0">
				<p className="text-xs text-muted-foreground">{label}</p>
				<p className="text-lg font-semibold tabular-nums">{numberFormat.format(value)}</p>
			</div>
		</div>
	);
}

function FrequentItems({
	title,
	items,
	emptyText,
}: {
	title: string;
	items: Array<{ inventoryId: string; name: string; records: number }>;
	emptyText: string;
}) {
	return (
		<section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
			<h2 className="text-sm font-semibold">{title}</h2>
			{items.length === 0 ? (
				<p className="mt-4 rounded-xl bg-muted/40 px-3 py-5 text-center text-sm text-muted-foreground">
					{emptyText}
				</p>
			) : (
				<ol className="mt-3 divide-y divide-border/70">
					{items.map((item, index) => (
						<li className="flex items-center gap-3 py-3 first:pt-1 last:pb-0" key={item.inventoryId}>
							<span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
								{index + 1}
							</span>
							<span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
							<span className="shrink-0 text-xs text-muted-foreground">{item.records} catatan</span>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}

function StockOverviewPage() {
	const [daysWindow, setDaysWindow] = useState<(typeof periods)[number]>(30);
	const data = useHybridStockOverview(daysWindow);
	const analytics = useMemo(
		() => data ? buildStockOverviewAnalytics(data.items, data.movements, daysWindow) : null,
		[data, daysWindow],
	);

	if (data === undefined) {
		return (
			<div className="space-y-4 p-4 md:p-6" aria-busy="true">
				<div className="h-20 animate-pulse rounded-2xl bg-muted/60" />
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					{periods.slice(0, 2).map((period) => <div className="h-24 animate-pulse rounded-2xl bg-muted/60" key={period} />)}
					<div className="hidden h-24 animate-pulse rounded-2xl bg-muted/60 md:block" />
					<div className="hidden h-24 animate-pulse rounded-2xl bg-muted/60 md:block" />
				</div>
				<p className="text-sm text-muted-foreground" role="status">Memuat analitik stok…</p>
			</div>
		);
	}

	if (!data || !analytics) {
		return (
			<div className="m-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800" role="alert">
				<h1 className="font-semibold">Ringkasan stok belum bisa dimuat</h1>
				<p className="mt-1 text-sm">Periksa koneksi, lalu muat ulang halaman. Data stok tidak diubah.</p>
				<button className="mt-3 min-h-11 rounded-lg border border-rose-300 px-3 text-sm font-medium hover:bg-rose-100" onClick={() => window.location.reload()} type="button">
					Muat ulang
				</button>
			</div>
		);
	}

	const statusRows = [
		{ label: "Tersedia", count: analytics.stock.available, color: "bg-emerald-500" },
		{ label: "Habis", count: analytics.stock.out, color: "bg-rose-500" },
		{ label: "Belum dicek", count: analytics.stock.unknown, color: "bg-amber-400" },
	];

	return (
		<div className="min-h-full bg-slate-50/70">
			<header className="border-b border-border/70 bg-background px-4 py-4 md:px-6 md:py-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<Djiwa3DIcon alt="" className="h-12 w-12" name="sales-report" size="sm" />
						<div className="min-w-0">
							<p className="text-xs text-muted-foreground">Admin / Ringkasan Stok</p>
							<h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">Ringkasan Stok</h1>
							<p className="mt-0.5 text-sm text-muted-foreground">Analitik posisi stok dan pergerakan bahan.</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<label className="sr-only" htmlFor="stock-summary-period">Rentang analitik</label>
						<select
							className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
							id="stock-summary-period"
							onChange={(event) => setDaysWindow(Number(event.target.value) as (typeof periods)[number])}
							value={daysWindow}
						>
							<option value={7}>7 hari</option>
							<option value={30}>30 hari</option>
							<option value={90}>90 hari</option>
						</select>
						<Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85" to="/admin/inventory">
							<ClipboardList className="h-4 w-4" aria-hidden="true" />
							Kelola inventaris
						</Link>
					</div>
				</div>
			</header>

			<main className="space-y-5 p-4 pb-10 md:p-6">
				<section aria-label="Status stok saat ini" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
					<StatusMetric label="Bahan dipantau" value={analytics.stock.total} tone="neutral" />
					<StatusMetric label="Tersedia" value={analytics.stock.available} tone="green" />
					<StatusMetric label="Habis" value={analytics.stock.out} tone="red" />
					<StatusMetric label="Belum dicek" value={analytics.stock.unknown} tone="amber" />
				</section>

				<section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm md:p-5">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h2 className="text-base font-semibold">Pergerakan barang</h2>
							<p className="mt-1 text-sm text-muted-foreground">Jumlah catatan masuk, keluar, dan penyesuaian per {daysWindow > 30 ? "pekan" : "hari"}.</p>
						</div>
						<span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">{daysWindow} hari terakhir</span>
					</div>

					<div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
						<MovementMetric icon={ArrowDownLeft} label="Transaksi masuk" tone="green" value={analytics.transactions.incoming} />
						<MovementMetric icon={ArrowUpRight} label="Transaksi keluar" tone="red" value={analytics.transactions.outgoing} />
						<MovementMetric icon={RefreshCw} label="Penyesuaian" tone="blue" value={analytics.transactions.adjustments} />
						<MovementMetric icon={Boxes} label="Lainnya" tone="neutral" value={analytics.transactions.other} />
					</div>

					<div className="mt-5 h-64 w-full" aria-label="Grafik jumlah transaksi stok" role="img">
						{analytics.transactions.incoming + analytics.transactions.outgoing + analytics.transactions.adjustments + analytics.transactions.other === 0 ? (
							<div className="grid h-full place-items-center rounded-xl bg-muted/30 px-5 text-center text-sm text-muted-foreground">
								Belum ada transaksi masuk, keluar, atau penyesuaian pada rentang ini.
							</div>
						) : (
							<ResponsiveContainer height="100%" width="100%">
								<BarChart data={analytics.trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
									<CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
									<XAxis axisLine={false} dataKey="label" minTickGap={18} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
									<YAxis allowDecimals={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
									<Tooltip formatter={(value, name) => [`${value} catatan`, name]} />
									<Bar dataKey="incoming" fill="#16a34a" name="Masuk" radius={[4, 4, 0, 0]} />
									<Bar dataKey="outgoing" fill="#e11d48" name="Keluar" radius={[4, 4, 0, 0]} />
									<Bar dataKey="adjustments" fill="#0284c7" name="Penyesuaian" radius={[4, 4, 0, 0]} />
									<Bar dataKey="other" fill="#64748b" name="Lainnya" radius={[4, 4, 0, 0]} />
								</BarChart>
							</ResponsiveContainer>
						)}
					</div>

					<p className="mt-2 rounded-xl bg-muted/35 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
						Masuk merangkum restock, penambahan, dan produksi; keluar merangkum penggunaan. Jenis lain tetap muncul terpisah. Perubahan jumlah langsung pada Inventaris adalah pengecekan atau koreksi saldo, jadi tidak dihitung sebagai transaksi masuk/keluar.
					</p>
				</section>

				<div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
					<section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm md:p-5">
						<div className="flex items-center justify-between gap-3">
							<div>
								<h2 className="text-base font-semibold">Catatan pergerakan terbaru</h2>
								<p className="mt-1 text-sm text-muted-foreground">Detail barang masuk, keluar, dan perubahan lain.</p>
							</div>
							<span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{analytics.recent.length} catatan</span>
						</div>
						{analytics.recent.length === 0 ? (
							<p className="mt-4 rounded-xl bg-muted/35 px-3 py-8 text-center text-sm text-muted-foreground">
								Riwayat transaksi stok belum tersedia untuk rentang ini.
							</p>
						) : (
							<div className="mt-4 overflow-x-auto rounded-xl border border-border/70">
								<table className="w-full min-w-[650px] border-collapse text-left text-sm">
									<thead className="bg-muted/40 text-xs text-muted-foreground">
										<tr>
											<th className="px-3 py-3 font-medium">Waktu</th>
											<th className="px-3 py-3 font-medium">Bahan</th>
											<th className="px-3 py-3 font-medium">Jenis</th>
											<th className="px-3 py-3 text-right font-medium">Jumlah</th>
											<th className="px-3 py-3 font-medium">Catatan</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border/70">
										{analytics.recent.map((movement) => {
											const direction = getMovementDirection(movement.type);
											return (
												<tr className="hover:bg-muted/20" key={movement._id}>
													<td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
														{Number.isFinite(movement.timestamp) ? new Date(movement.timestamp).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "—"}
													</td>
													<td className="max-w-56 truncate px-3 py-3 font-medium" title={movement.name}>{movement.name}</td>
													<td className="px-3 py-3">
														<span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", directionTone(direction))}>{getMovementLabel(movement.type)}</span>
													</td>
													<td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">{movementQuantity(movement)}</td>
													<td className="max-w-48 truncate px-3 py-3 text-xs text-muted-foreground" title={movement.notes || ""}>{movement.notes || "—"}</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}
					</section>

					<section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm md:p-5">
						<div className="flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
							<h2 className="text-base font-semibold">Posisi stok saat ini</h2>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">Status terkini dari pencatatan manual.</p>
						<div className="mt-5 space-y-4">
							{statusRows.map((row) => {
								const percent = analytics.stock.total ? (row.count / analytics.stock.total) * 100 : 0;
								return (
									<div key={row.label}>
										<div className="mb-1.5 flex items-center justify-between text-sm">
											<span className="text-muted-foreground">{row.label}</span>
											<strong className="font-semibold tabular-nums">{row.count}</strong>
										</div>
										<div className="h-2 overflow-hidden rounded-full bg-muted">
											<div className={cn("h-full rounded-full transition-[width]", row.color)} style={{ width: `${percent}%` }} />
										</div>
									</div>
								);
							})}
						</div>
						<div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
							<FrequentItems emptyText="Belum ada catatan barang masuk." items={analytics.incomingItems} title="Sering masuk" />
							<FrequentItems emptyText="Belum ada catatan barang keluar." items={analytics.outgoingItems} title="Sering keluar" />
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
