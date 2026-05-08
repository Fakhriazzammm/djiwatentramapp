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
		<div className="space-y-2.5 p-1">
			{/* ── Header bar ─────────────────────────────────── */}
			<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-xs">
				<div>
					<h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">Keuangan</h2>
					<p className="text-[9px] text-slate-400">Grafik arus kas &amp; analisa keuangan</p>
				</div>
				<div className="flex items-center gap-1.5">
					<Link
						to="/admin/finance/transactions"
						className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
					>
						<ListOrdered className="h-3 w-3" /> Transaksi
					</Link>
					<Link
						to="/admin/finance/reports"
						className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
					>
						<FileBarChart className="h-3 w-3" /> Laporan
					</Link>
				</div>
			</div>

			{/* ── Period selector ────────────────────────────── */}
			<div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200/80 bg-white px-2 py-1.5 shadow-xs">
				{PERIODS.map((p) => (
					<button
						key={p.id}
						type="button"
						onClick={() => setSelectedRange(p.id)}
						className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
							selectedRange === p.id
								? "border-emerald-500 bg-emerald-50 text-emerald-700"
								: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
						}`}
					>
						{p.label}
					</button>
				))}
			</div>

			{/* ── Summary cards ──────────────────────────────── */}
			<div className="grid grid-cols-3 gap-1.5">
				{([
					{ label: "Pemasukan", value: summary?.totalIncome, color: "text-emerald-600", bg: "bg-emerald-50", icon: <ArrowDownLeft className="h-3 w-3" /> },
					{ label: "Pengeluaran", value: summary?.totalExpense, color: "text-orange-500", bg: "bg-orange-50", icon: <ArrowUpRight className="h-3 w-3" /> },
					{ label: "Saldo Bersih", value: summary?.netBalance, color: (v?: number) => (v ?? 0) >= 0 ? "text-slate-900" : "text-red-600", bg: "bg-slate-50", icon: <Wallet className="h-3 w-3" /> },
				] as const).map((card) => (
					<div key={card.label} className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 shadow-xs">
						<div className="flex items-center justify-between">
							<span className="text-[9px] font-medium uppercase tracking-wider text-slate-500">{card.label}</span>
							<div className={`rounded p-1 ${card.bg} ${typeof card.color === "function" ? "" : card.color}`}>
								{card.icon}
							</div>
						</div>
						{card.value !== undefined ? (
							<p className={`mt-1 font-bold text-[11px] font-mono ${typeof card.color === "function" ? card.color(card.value) : card.color}`}>
								{fmt(card.value)}
							</p>
						) : (
							<Skeleton className="mt-1 h-4 w-28" />
						)}
					</div>
				))}
			</div>

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
						] as const).map((item) => (
							<div key={item.label}>
								<p className="text-[9px] text-slate-500">{item.label}</p>
								<p className={`font-bold text-[11px] font-mono ${item.color}`}>
									{item.icon}{item.suffix ? `${item.value?.toFixed(1)}${item.suffix}` : fmt(item.value ?? 0)}
								</p>
								<p className="text-[8px] text-slate-400">
									{hppCogs.matchedOrders}/{hppCogs.totalCompletedOrders} pesanan
								</p>
							</div>
						))}
					</div>
					{/* Daily breakdown */}
					{hppCogs.dailySummary.length > 0 && (
						<div className="mt-2 border-t border-slate-100 pt-2">
							<p className="mb-1 text-[9px] font-semibold text-slate-500">Ringkasan Harian</p>
							<div className="space-y-0.5">
								{hppCogs.dailySummary.slice(0, 7).map((day: any) => (
									<div key={day.date} className="flex items-center justify-between rounded border border-slate-100 px-2 py-1 text-[9px]">
										<span className="font-medium text-slate-600">
											{new Date(day.date).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
										</span>
										<div className="flex items-center gap-3">
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
