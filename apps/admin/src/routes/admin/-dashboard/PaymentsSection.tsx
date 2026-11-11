import { motion, useReducedMotion } from "framer-motion";
import type { AdminOverview, Source } from "@/hooks/use-admin-overview";
import type { BreakdownPayload, DjiwaPayPayload } from "@/lib/dashboard-analytics";
import { formatCompactRupiah, formatRupiah } from "@/lib/dashboard-analytics";
import { useState } from "react";
import { AnimatedNumber, GrowBar, Segmented } from "./motion";
import { BLUE, Card, Empty, Label, Masked, SectionTitle, SourceError, Skeleton, VIOLET, useRupiah } from "./ui";

function valueOf<T>(source: Source<T>): T | null {
	return source.ok ? source.value : null;
}

const METHOD_LABEL: Record<string, string> = {
	djiwa_pay: "DjiwaPay",
	qris_mayar: "QRIS (Mayar)",
	cashier_cash: "Tunai (kasir)",
	unknown: "Lainnya",
};
const CHANNEL_LABEL: Record<string, string> = {
	pos: "POS kasir",
	app: "Aplikasi DjiwaApp",
	booking: "Booking",
	gofood: "GoFood",
	grabfood: "GrabFood",
	shopeefood: "ShopeeFood",
	telegram: "Telegram",
	unknown: "Lainnya",
};
const LEDGER_LABEL: Record<string, string> = {
	topup_completed: "Top up",
	topup_pending: "Top up (menunggu)",
	order_debit: "Bayar pesanan",
	refund: "Refund",
	manual_credit: "Kredit manual",
	manual_debit: "Debit manual",
	adjustment: "Penyesuaian",
	wallet_hold: "Tahan saldo",
	wallet_capture: "Pembayaran",
	wallet_release: "Lepas tahan",
};

export function labelMethod(key: string) {
	return METHOD_LABEL[key] ?? titleCase(key);
}
export function labelChannel(key: string) {
	return CHANNEL_LABEL[key] ?? titleCase(key);
}
function titleCase(value: string) {
	return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function DjiwaPaySection({ overview, periodLabel }: { overview: AdminOverview; periodLabel: string }) {
	const payload = valueOf(overview.djiwapay);
	const error = overview.djiwapay.ok ? null : overview.djiwapay.error;
	return (
		<div>
			<SectionTitle color={VIOLET} right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{periodLabel}</span>}>
				DjiwaPay · pembayaran &amp; dompet
			</SectionTitle>
			{error ? (
				<SourceError message={error} />
			) : !payload ? (
				<div className="grid gap-3 lg:grid-cols-3">
					<Skeleton className="h-52 w-full" />
					<Skeleton className="h-52 w-full" />
					<Skeleton className="h-52 w-full" />
				</div>
			) : (
				<div className="grid gap-3 lg:grid-cols-3">
					<div className="command-payment-summary"><VolumeCard payload={payload} /><WalletCard payload={payload} /></div>
					<SourceCard payload={payload} />
					<LedgerCard payload={payload} />
				</div>
			)}
		</div>
	);
}

function VolumeCard({ payload }: { payload: DjiwaPayPayload }) {
	const rupiah = useRupiah();
	const statuses = payload.statusCounts;
	const success = (statuses.paid ?? 0) + (statuses.completed ?? 0);
	const pending = statuses.pending ?? 0;
	const cancelled = (statuses.cancelled ?? 0) + (statuses.expired ?? 0) + (statuses.failed ?? 0);
	const total = Object.values(statuses).reduce((sum, value) => sum + value, 0);
	const rate = total ? Math.round((success / total) * 100) : 0;
	const segments = [
		{ label: "Berhasil", value: success, color: VIOLET },
		{ label: "Menunggu", value: pending, color: "#d69e2e" },
		{ label: "Batal / gagal", value: cancelled, color: "#9ca3af" },
	];
	return (
		<Card label={<Label tone="ink">Volume pembayaran</Label>}>
			<div className="font-display text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[#111114]">
				<Masked>
					<AnimatedNumber value={payload.volume} format={(next) => formatCompactRupiah(next)} />
				</Masked>
			</div>
			<div className="mt-2 font-mono text-[10px] text-[#666672]">
				<Masked>{payload.transactions} transaksi berhasil</Masked> · tingkat sukses {rate}%
			</div>
			<div className="mt-4 flex h-2 overflow-hidden bg-[#ececf0]" role="img" aria-label={`Status pembayaran DjiwaPay: berhasil ${success}, menunggu ${pending}, batal atau gagal ${cancelled}`}>
				{segments.map((segment, index) => (
					<motion.div
						key={segment.label}
						className="h-full"
						style={{ background: segment.color }}
						initial={{ width: 0 }}
						animate={{ width: `${total ? (segment.value / total) * 100 : 0}%` }}
						transition={{ duration: 0.8, delay: 0.1 + index * 0.1, ease: [0.2, 0.7, 0.2, 1] }}
					/>
				))}
			</div>
			<ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[10px] text-[#444450]">
				{segments.map((segment) => (
					<li key={segment.label} className="inline-flex items-center gap-1.5">
						<span aria-hidden="true" className="h-2 w-2" style={{ background: segment.color }} />
						{segment.label} <Masked>{segment.value}</Masked>
					</li>
				))}
			</ul>
			<p className="mt-3 font-mono text-[10px] text-[#666672]">Pembayaran memakai metode DjiwaPay pada pesanan settled dan belum dibayar. Nilai rupiah: <Masked>{rupiah(payload.volume)}</Masked>.</p>
		</Card>
	);
}

function WalletCard({ payload }: { payload: DjiwaPayPayload }) {
	const rupiah = useRupiah();
	return (
		<Card label={<Label tone="ink">Saldo dompet pelanggan</Label>}>
			<div className="grid grid-cols-2 gap-px bg-[#e4e4e8]">
				<div className="bg-white p-3">
					<div className="font-mono text-[15px] font-semibold tabular-nums text-[#111114]"><Masked>{rupiah(payload.availableBalance)}</Masked></div>
					<Label className="mt-1.5">Saldo tersedia</Label>
				</div>
				<div className="bg-white p-3">
					<div className="font-mono text-[15px] font-semibold tabular-nums text-[#111114]"><Masked>{rupiah(payload.heldBalance)}</Masked></div>
					<Label className="mt-1.5">Saldo ditahan</Label>
				</div>
			</div>
			<div className="mt-3 flex items-center justify-between font-mono text-[11px] text-[#444450]">
				<span>Dompet aktif</span>
				<span className="font-semibold text-[#111114]"><Masked>{payload.activeWallets}</Masked></span>
			</div>
			<p className="mt-3 font-mono text-[10px] leading-relaxed text-[#666672]">Saldo adalah posisi saat ini (tidak mengikuti filter periode).</p>
		</Card>
	);
}

function SourceCard({ payload }: { payload: DjiwaPayPayload }) {
	const rupiah = useRupiah();
	const total = payload.channels.reduce((sum, row) => sum + row.revenue, 0);
	return (
		<Card label={<Label tone="ink">Per sumber pesanan DjiwaPay</Label>}>
			{payload.channels.length === 0 ? (
				<Empty>Belum ada pembayaran DjiwaPay settled pada periode ini.</Empty>
			) : (
				<ul className="space-y-3">
					{payload.channels.map((row, index) => (
						<li key={row.key}>
							<div className="flex items-baseline justify-between gap-2 text-[12px]">
								<span>{labelChannel(row.key)}</span>
								<span className="font-mono text-[11px] text-[#444450]"><Masked>{row.orders} · {rupiah(row.revenue)}</Masked></span>
							</div>
							<div className="mt-1 h-1.5 overflow-hidden bg-[#ececf0]">
								<GrowBar ratio={total ? row.revenue / total : 0} delay={0.1 + index * 0.06} className="h-full" style={{ background: VIOLET }} />
							</div>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}

function LedgerCard({ payload }: { payload: DjiwaPayPayload }) {
	const rupiah = useRupiah();
	const reduceMotion = useReducedMotion();
	return (
		<Card label={<Label tone="ink">Mutasi dompet terbaru</Label>}>
			{payload.ledger.length === 0 ? (
				<Empty>Belum ada mutasi dompet pada periode ini.</Empty>
			) : (
				<ul className="divide-y divide-[#efeff2]">
					{payload.ledger.map((entry, index) => {
						const credit = entry.direction === "credit";
						return (
							<motion.li
								key={entry.id}
								initial={reduceMotion ? false : { opacity: 0, x: -8 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ duration: 0.4, delay: index * 0.04 }}
								className="flex items-center gap-3 py-2.5 text-[12px]"
							>
								<span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center font-mono text-[13px] font-semibold ${credit ? "bg-[#e8f5ee] text-[#166534]" : "bg-[#fdecea] text-[#b42318]"}`}>
									{credit ? "+" : "−"}
								</span>
								<div className="min-w-0 flex-1">
									<div className="truncate">{LEDGER_LABEL[entry.transactionType] ?? titleCase(entry.transactionType)}</div>
									<div className="truncate font-mono text-[10px] text-[#666672]">{entry.note ?? "—"}</div>
								</div>
								<div className="text-right">
									<div className={`font-mono text-[12px] font-semibold tabular-nums ${credit ? "text-[#166534]" : "text-[#b42318]"}`}><Masked>{rupiah(entry.amount)}</Masked></div>
									<div className="font-mono text-[10px] text-[#8e8e93]">{new Date(entry.createdAt + 7 * 3600_000).toISOString().slice(11, 16)} WIB</div>
								</div>
							</motion.li>
						);
					})}
				</ul>
			)}
		</Card>
	);
}

export function BreakdownSection({ overview, periodLabel }: { overview: AdminOverview; periodLabel: string }) {
	const breakdown = valueOf(overview.breakdown);
	const error = overview.breakdown.ok ? null : overview.breakdown.error;
	return (
		<div>
			<SectionTitle color={BLUE} right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{periodLabel}</span>}>
				Rincian penjualan
			</SectionTitle>
			{error ? (
				<SourceError message={error} />
			) : !breakdown ? (
				<div className="grid gap-3 lg:grid-cols-3">
					<Skeleton className="h-56 w-full" />
					<Skeleton className="h-56 w-full" />
					<Skeleton className="h-56 w-full" />
				</div>
			) : (
				<div className="grid gap-3 lg:grid-cols-3">
					<BreakdownList title="Metode pembayaran" rows={breakdown.methods.map((row) => ({ key: row.key, label: labelMethod(row.key), value: row.revenue, detail: `${row.orders} order` }))} color={BLUE} />
					<BreakdownList title="Kanal order" rows={breakdown.channels.map((row) => ({ key: row.key, label: labelChannel(row.key), value: row.revenue, detail: `${row.orders} order` }))} color="#0e7490" />
					<ProductList breakdown={breakdown} />
				</div>
			)}
		</div>
	);
}

function BreakdownList({ title, rows, color }: { title: string; rows: Array<{ key: string; label: string; value: number; detail: string }>; color: string }) {
	const rupiah = useRupiah();
	const max = Math.max(...rows.map((row) => row.value), 1);
	return (
		<Card label={<Label tone="ink">{title}</Label>}>
			{rows.length === 0 ? (
				<Empty>Belum ada transaksi settled.</Empty>
			) : (
				<ul className="space-y-3">
					{rows.map((row, index) => (
						<li key={row.key}>
							<div className="flex items-baseline justify-between gap-2 text-[12px]">
								<span className="truncate">{row.label}</span>
								<span className="shrink-0 font-mono text-[11px] text-[#444450]"><Masked>{row.detail} · {rupiah(row.value)}</Masked></span>
							</div>
							<div className="mt-1 h-1.5 overflow-hidden bg-[#ececf0]">
								<GrowBar ratio={row.value / max} delay={0.1 + index * 0.06} className="h-full" style={{ background: color }} />
							</div>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}

function ProductList({ breakdown }: { breakdown: BreakdownPayload }) {
	const rupiah = useRupiah();
	const [sortBy, setSortBy] = useState<"quantity" | "revenue">("quantity");
	const rows = [...breakdown.products].sort((left, right) => (sortBy === "quantity" ? right.quantity - left.quantity : right.revenue - left.revenue));
	const max = Math.max(...rows.map((row) => (sortBy === "quantity" ? row.quantity : row.revenue)), 1);
	return (
		<Card
			label={<Label tone="ink">Produk terlaris</Label>}
			action={<Segmented id="products-sort" label="Urutkan produk" size="sm" value={sortBy} onChange={setSortBy} options={[{ value: "quantity", label: "Qty" }, { value: "revenue", label: "Omzet" }]} />}
		>
			{rows.length === 0 ? (
				<Empty>Belum ada produk terjual pada periode ini.</Empty>
			) : (
				<ul className="space-y-3">
					{rows.map((row, index) => {
						const amount = sortBy === "quantity" ? row.quantity : row.revenue;
						return (
							<li key={`${row.name}-${index}`}>
								<div className="flex items-baseline justify-between gap-2 text-[12px]">
									<span className="truncate">{row.name || "Produk"}</span>
									<span className="shrink-0 font-mono text-[11px] text-[#444450]">
										<Masked>{sortBy === "quantity" ? `${Math.round(row.quantity)} porsi` : formatRupiah(row.revenue)}</Masked>
									</span>
								</div>
								<div className="mt-1 h-1.5 overflow-hidden bg-[#ececf0]">
									<GrowBar ratio={amount / max} delay={0.1 + index * 0.05} className="h-full" style={{ background: index === 0 ? "#b7791f" : BLUE }} />
								</div>
							</li>
						);
					})}
				</ul>
			)}
			<p className="mt-3 font-mono text-[10px] text-[#666672]">Produk dihitung dari item pesanan settled (tanpa item yang dibatalkan). Total omzet: <Masked>{rupiah(breakdown.products.reduce((sum, row) => sum + row.revenue, 0))}</Masked>.</p>
		</Card>
	);
}
