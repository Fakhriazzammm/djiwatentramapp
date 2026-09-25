import {
	ArrowDownLeft,
	ArrowUpRight,
	Calculator,
	FileBarChart,
	ListOrdered,
	TrendingUp,
	Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import {
	ExpenseCategoryPieChart,
	PeriodComparisonCards,
	TrendChart,
} from "./finance-charts";
import {
	useHybridFinancialSummary,
	useHybridOrdersCogs,
} from "@/hooks/use-hybrid-finance-analytics-data";

const RANGE_LABEL_MAP: Record<string, string> = {
	today: "Hari Ini",
	yesterday: "Kemarin",
	this_week: "Minggu Ini",
	last_week: "Minggu Kemarin",
	month: "Bulan Ini",
	last_month: "Bulan Kemarin",
};

const PERIODS = [
	{ id: "today", label: "Hari Ini" },
	{ id: "yesterday", label: "Kemarin" },
	{ id: "this_week", label: "Minggu Ini" },
	{ id: "last_week", label: "Minggu Kemarin" },
	{ id: "month", label: "Bulan Ini" },
	{ id: "last_month", label: "Bulan Kemarin" },
] as const;

function getRange(selected: string): { startDate?: number; endDate?: number } {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

	switch (selected) {
		case "today":
			return { startDate: today };
		case "yesterday":
			return { startDate: today - 86400000, endDate: today - 1 };
		case "this_week": {
			const d = new Date(now);
			const day = d.getDay();
			const diff = d.getDate() - day + (day === 0 ? -6 : 1);
			return { startDate: new Date(d.setDate(diff)).setHours(0, 0, 0, 0) };
		}
		case "last_week": {
			const d2 = new Date(now);
			const day2 = d2.getDay();
			const diff2 = d2.getDate() - day2 + (day2 === 0 ? -13 : -6);
			const lws = new Date(d2.setDate(diff2)).setHours(0, 0, 0, 0);
			return { startDate: lws, endDate: lws + 7 * 86400000 - 1 };
		}
		case "month":
			return { startDate: new Date(now.getFullYear(), now.getMonth(), 1).getTime() };
		case "last_month": {
			const flm = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
			const llm = new Date(now.getFullYear(), now.getMonth(), 0).setHours(23, 59, 59, 999);
			return { startDate: flm, endDate: llm };
		}
		default:
			return {};
	}
}

const fmt = (v: number) =>
	new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

export function FinanceDashboard() {
	const [selectedRange, setSelectedRange] = useState("month");
	const range = getRange(selectedRange);

	const summary = useHybridFinancialSummary({ startDate: range.startDate, endDate: range.endDate });
	const hppCogs = useHybridOrdersCogs({ startDate: range.startDate, endDate: range.endDate });

	return (
		<div className="min-w-0 space-y-2.5 overflow-x-hidden md:space-y-3">
			{/* ── Page identity and primary actions ───────────── */}
			<section className="flex min-w-0 flex-col justify-between gap-2 rounded-[22px] border border-border/80 bg-card p-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:flex-row sm:items-center sm:p-4">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Kontrol finansial</p>
					<h1 className="mt-1 font-display text-[22px] font-bold tracking-tight text-foreground sm:text-2xl">Keuangan</h1>
					<p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">Saldo, pemasukan, dan pengeluaran dalam satu layar.</p>
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<Link
						to="/admin/finance/transactions"
						className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<ListOrdered className="h-4 w-4" /> Transaksi
					</Link>
					<Link
						to="/admin/finance/reports"
						className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-transform active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<FileBarChart className="h-4 w-4" /> Laporan
					</Link>
				</div>
			</section>

			{/* ── Period selector ────────────────────────────── */}
			<div aria-label="Pilih periode laporan" className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-[18px] border border-border/80 bg-card p-1 shadow-[0_6px_20px_rgba(15,23,42,0.035)]">
				{PERIODS.map((p) => (
					<button
						key={p.id}
						type="button"
						onClick={() => setSelectedRange(p.id)}
						aria-pressed={selectedRange === p.id}
						className={`min-h-11 shrink-0 rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:min-h-9 sm:py-1.5 ${
							selectedRange === p.id
								? "border-primary bg-primary/10 text-primary"
								: "border-border bg-background text-muted-foreground hover:bg-muted"
						}`}
					>
						{p.label}
					</button>
				))}
			</div>

			{/* ── Primary balance with supporting cash flow ───── */}
			<section className="grid gap-2 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
				<div className="rounded-[22px] border border-primary/15 bg-primary/[0.06] p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)] sm:p-4">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Saldo bersih</p>
							<p className="mt-1 text-xs text-muted-foreground">{RANGE_LABEL_MAP[selectedRange]}</p>
						</div>
						<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Wallet className="h-5 w-5" /></span>
					</div>
					{summary?.netBalance !== undefined ? (
						<p className={`mt-3 break-words font-display text-[26px] font-bold tabular-nums sm:text-3xl ${summary.netBalance >= 0 ? "text-foreground" : "text-destructive"}`}>
							{fmt(summary.netBalance)}
						</p>
					) : (
						<Skeleton className="mt-4 h-9 w-52" />
					)}
				</div>
				<div className="grid grid-cols-2 gap-2">
					<div className="rounded-[20px] border border-emerald-500/15 bg-card p-3 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
						<div className="flex items-center justify-between text-emerald-600"><span className="text-xs font-semibold">Pemasukan</span><ArrowDownLeft className="h-4 w-4" /></div>
						{summary?.totalIncome !== undefined ? <p className="mt-3 break-words text-sm font-bold tabular-nums text-emerald-700">{fmt(summary.totalIncome)}</p> : <Skeleton className="mt-3 h-5 w-full" />}
					</div>
					<div className="rounded-[20px] border border-orange-500/15 bg-card p-3 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
						<div className="flex items-center justify-between text-orange-600"><span className="text-xs font-semibold">Pengeluaran</span><ArrowUpRight className="h-4 w-4" /></div>
						{summary?.totalExpense !== undefined ? <p className="mt-3 break-words text-sm font-bold tabular-nums text-orange-700">{fmt(summary.totalExpense)}</p> : <Skeleton className="mt-3 h-5 w-full" />}
					</div>
				</div>
			</section>

			{/* ── Period comparison ──────────────────────────── */}
			<PeriodComparisonCards />

			{/* ── Charts row ─────────────────────────────────── */}
			<div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
				<TrendChart />
				<ExpenseCategoryPieChart />
			</div>

			{/* ── COGS / HPP Analysis ────────────────────────── */}
			{hppCogs && hppCogs.matchedOrders > 0 && (
				<div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 shadow-xs">
					<h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
						<Calculator className="h-3 w-3" /> Analisis Laba Kotor (HPP)
					</h3>
					<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
						{([
							{ label: "Revenue", value: hppCogs.totalRevenue, color: "text-slate-900" },
							{ label: "Total COGS", value: hppCogs.totalCogs, color: "text-orange-600" },
							{ label: "Laba Kotor", value: hppCogs.totalProfit, color: hppCogs.totalProfit >= 0 ? "text-emerald-600" : "text-red-600" },
							{ label: "Gross Margin", value: hppCogs.grossMargin, color: "text-primary", suffix: "%", icon: <TrendingUp className="h-3 w-3" /> },
						] as { label: string; value: any; color: string; suffix?: string; icon?: React.ReactNode }[]).map((item) => (
							<div key={item.label}>
								<p className="text-[11px] text-slate-500">{item.label}</p>
								<p className={`font-bold text-[11px] font-mono ${item.color}`}>
									{item.icon}{item.suffix ? `${item.value?.toFixed(1)}${item.suffix}` : fmt(item.value ?? 0)}
								</p>
								<p className="text-[10px] text-slate-400">
									{hppCogs.matchedOrders}/{hppCogs.totalCompletedOrders} pesanan
								</p>
							</div>
						))}
					</div>
					{/* Daily breakdown */}
					{hppCogs.dailySummary.length > 0 && (
						<div className="mt-2 border-t border-slate-100 pt-2">
							<p className="mb-1 text-[11px] font-semibold text-slate-500">Ringkasan Harian</p>
							<div className="space-y-0.5">
								{hppCogs.dailySummary.slice(0, 7).map((day: any) => (
									<div key={day.date} className="flex min-w-0 flex-col gap-1 rounded border border-slate-100 px-2 py-1.5 text-[11px] sm:flex-row sm:items-center sm:justify-between">
										<span className="font-medium text-slate-600">
											{new Date(day.date).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
										</span>
										<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 sm:justify-end">
											<span className="text-slate-400">{day.orders} pesanan</span>
											<span>Rev: {fmt(day.revenue)}</span>
											<span className="text-orange-600">COGS: {fmt(day.cogs)}</span>
											<span className={`font-semibold ${day.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
												Laba: {fmt(day.profit)}
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
