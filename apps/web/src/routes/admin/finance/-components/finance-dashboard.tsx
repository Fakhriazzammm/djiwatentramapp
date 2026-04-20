import {
	ArrowDownLeft,
	ArrowUpRight,
	Calculator,
	FileBarChart,
	Focus,
	Plus,
	TrendingUp,
	Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTransactionDialog } from "./new-transaction-dialog";
import { FinancialTargetPanel } from "./financial-target-panel";
import { ExpenseCategoryPieChart, PeriodComparisonCards, TrendChart } from "./finance-charts";
import { TransactionDetailReport } from "../transactions/-components/transaction-detail-report";
import type { DateRange } from "../reports/-components/period-selector";
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

export function FinanceDashboard() {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [focusMode, setFocusMode] = useState(true);
	const [tableViewMode, setTableViewMode] = useState<"transaction" | "item">("item");
	const [groupMode, setGroupMode] = useState<"flat" | "grouped">("grouped");

	const [selectedRange, setSelectedRange] = useState("month");
	const [startDate, setStartDate] = useState<number | undefined>(() => {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); // Default: This Month
	});
	const [endDate, setEndDate] = useState<number | undefined>(undefined);

	const handleRangeChange = (range: string) => {
		setSelectedRange(range);
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

		switch (range) {
			case "today":
				setStartDate(today);
				setEndDate(undefined);
				break;
			case "yesterday":
				const yesterday = today - 24 * 60 * 60 * 1000;
				setStartDate(yesterday);
				setEndDate(yesterday + 24 * 60 * 60 * 1000 - 1);
				break;
			case "this_week":
				const d = new Date(now);
				const day = d.getDay();
				const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
				const weekStart = new Date(d.setDate(diff)).setHours(0, 0, 0, 0);
				setStartDate(weekStart);
				setEndDate(undefined);
				break;
			case "last_week":
				const d2 = new Date(now);
				const day2 = d2.getDay();
				const diff2 = d2.getDate() - day2 + (day2 === 0 ? -13 : -6);
				const lastWeekStart = new Date(d2.setDate(diff2)).setHours(0, 0, 0, 0);
				setStartDate(lastWeekStart);
				setEndDate(lastWeekStart + 7 * 24 * 60 * 60 * 1000 - 1);
				break;
			case "month":
				setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
				setEndDate(undefined);
				break;
			case "last_month":
				const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
				const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).setHours(23, 59, 59, 999);
				setStartDate(firstOfLastMonth);
				setEndDate(lastOfLastMonth);
				break;
			default:
				setStartDate(undefined);
				setEndDate(undefined);
		}
	};

	const summary = useHybridFinancialSummary({
		startDate,
		endDate,
	});

	const hppCogs = useHybridOrdersCogs({
		startDate,
		endDate,
	});

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(amount);
	};

	const dashboardRange: DateRange = {
		startDate: startDate ?? 0,
		endDate: endDate ?? Date.now(),
		label: RANGE_LABEL_MAP[selectedRange] || "Periode Dipilih",
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="font-semibold text-lg tracking-tight">Keuangan</h2>
					<p className="text-muted-foreground text-xs">
						Monitor arus kas dan laporan keuangan
					</p>
				</div>
				<div className="flex flex-wrap gap-1.5">
					<button
						type="button"
						onClick={() => setFocusMode((prev) => !prev)}
						className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
							focusMode
								? "bg-primary text-primary-foreground"
								: "border border-border bg-muted text-foreground hover:bg-muted/80"
						}`}
					>
						<Focus className="h-3.5 w-3.5" />
						{focusMode ? "Mode Fokus" : "Mode Lengkap"}
					</button>
					<Link
						to="/admin/finance/reports"
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/70"
					>
						<FileBarChart className="h-3.5 w-3.5" /> Laporan
					</Link>
					<button
						className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
						onClick={() => setIsDialogOpen(true)}
						type="button"
					>
						<Plus className="h-3.5 w-3.5" /> Catat Transaksi
					</button>
				</div>
			</div>

			{/* Date Range Filter */}
			<div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card px-3 py-2">
				{[
					{ id: "today", label: "Hari Ini" },
					{ id: "yesterday", label: "Kemarin" },
					{ id: "this_week", label: "Minggu Ini" },
					{ id: "last_week", label: "Minggu Kemarin" },
					{ id: "month", label: "Bulan Ini" },
					{ id: "last_month", label: "Bulan Kemarin" },
				].map((range) => (
					<button
						key={range.id}
						onClick={() => handleRangeChange(range.id)}
						className={`rounded-md px-2.5 py-1.5 font-semibold text-[11px] transition-colors ${
							selectedRange === range.id
								? "bg-primary text-primary-foreground shadow-sm"
								: "bg-muted text-muted-foreground hover:bg-muted/70"
						}`}
						type="button"
					>
						{range.label}
					</button>
				))}
			</div>

			{!focusMode && (
				<>
					{/* Financial Target Panel */}
					<FinancialTargetPanel />

					{/* Period Comparison */}
					<div className="space-y-2">
						<h3 className="font-semibold text-sm">Perbandingan Periode</h3>
						<PeriodComparisonCards />
					</div>

					{/* Charts Row */}
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<TrendChart />
						<ExpenseCategoryPieChart />
					</div>
				</>
			)}

			{/* Summary Cards */}
			<div className="grid grid-cols-1 gap-2 md:grid-cols-3">
				<div className="rounded-xl border border-border bg-card px-3 py-2.5">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-medium text-muted-foreground text-xs">
								Total Pemasukan
							</p>
							<div className="mt-1">
								{summary ? (
									<h3 className="font-bold text-base text-primary">
										{formatCurrency(summary.totalIncome)}
									</h3>
								) : (
									<Skeleton className="h-8 w-32" />
								)}
							</div>
						</div>
						<div className="rounded-md bg-green-100 p-1.5 text-green-600 dark:bg-green-900/30">
							<ArrowDownLeft className="h-4 w-4" />
						</div>
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card px-3 py-2.5">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-medium text-muted-foreground text-xs">
								Total Pengeluaran
							</p>
							<div className="mt-1">
								{summary ? (
									<h3 className="font-bold text-base text-red-600">
										{formatCurrency(summary.totalExpense)}
									</h3>
								) : (
									<Skeleton className="h-8 w-32" />
								)}
							</div>
						</div>
						<div className="rounded-md bg-red-100 p-1.5 text-red-600 dark:bg-red-900/30">
							<ArrowUpRight className="h-4 w-4" />
						</div>
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card px-3 py-2.5">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-medium text-muted-foreground text-xs">
								Saldo Bersih
							</p>
							<div className="mt-1">
								{summary ? (
									<h3
										className={`font-bold text-base ${
											(summary?.netBalance || 0) >= 0
												? "text-primary"
												: "text-destructive"
										}`}
									>
										{formatCurrency(summary.netBalance)}
									</h3>
								) : (
									<Skeleton className="h-8 w-32" />
								)}
							</div>
						</div>
						<div className="rounded-md bg-blue-100 p-1.5 text-blue-600 dark:bg-blue-900/30">
							<Wallet className="h-4 w-4" />
						</div>
					</div>
				</div>
			</div>

			{/* COGS / HPP Analysis */}
			{!focusMode && hppCogs && hppCogs.matchedOrders > 0 && (
				<div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-3 py-3">
					<h3 className="mb-3 flex items-center gap-2 font-semibold text-sm">
						<Calculator className="h-5 w-5 text-primary" />
						Analisis Laba Kotor (HPP)
					</h3>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
						<div>
							<p className="text-muted-foreground text-xs">Revenue Penjualan</p>
							<p className="font-bold text-base">
								{formatCurrency(hppCogs.totalRevenue)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Total COGS</p>
							<p className="font-bold text-base text-orange-600">
								{formatCurrency(hppCogs.totalCogs)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Laba Kotor</p>
							<p
								className={`font-bold text-base ${hppCogs.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
							>
								{formatCurrency(hppCogs.totalProfit)}
							</p>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Gross Margin</p>
							<p className="flex items-center gap-1 font-bold text-base text-primary">
								<TrendingUp className="h-4 w-4" />
								{hppCogs.grossMargin.toFixed(1)}%
							</p>
							<p className="text-[10px] text-muted-foreground">
								{hppCogs.matchedOrders} dari {hppCogs.totalCompletedOrders}{" "}
								pesanan
							</p>
						</div>
					</div>
					{/* Daily Breakdown */}
					{hppCogs.dailySummary.length > 0 && (
						<div className="mt-3 border-border/50 border-t pt-3">
							<h4 className="mb-2 font-semibold text-muted-foreground text-xs">
								Ringkasan Harian
							</h4>
							<div className="space-y-1.5">
								{hppCogs.dailySummary.slice(0, 7).map((day: any) => (
									<div
										className="flex items-center justify-between rounded border border-border/30 px-3 py-1.5 text-xs"
										key={day.date}
									>
										<span className="font-medium">
											{new Date(day.date).toLocaleDateString("id-ID", {
												weekday: "short",
												day: "numeric",
												month: "short",
											})}
										</span>
										<div className="flex items-center gap-4">
											<span className="text-muted-foreground">
												{day.orders} pesanan
											</span>
											<span>Rev: {formatCurrency(day.revenue)}</span>
											<span className="text-orange-600">
												COGS: {formatCurrency(day.cogs)}
											</span>
											<span
												className={`font-bold ${day.profit >= 0 ? "text-green-600" : "text-red-600"}`}
											>
												Laba: {formatCurrency(day.profit)}
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Transaction List */}
			<div className="rounded-xl border border-border bg-card">
				<div className="flex flex-wrap items-center justify-between gap-2 border-border/50 border-b px-3 py-2.5">
					<div>
						<h3 className="font-semibold text-sm">Tabel Finance Operasional</h3>
						<p className="text-[10px] text-muted-foreground">
							Mode tabel disamakan dengan inventory: padat, informatif, dan siap CRUD.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						<button
							type="button"
							onClick={() => setTableViewMode("transaction")}
							className={`rounded-md px-2.5 py-1.5 font-semibold text-[11px] transition-colors ${
								tableViewMode === "transaction"
									? "bg-primary text-primary-foreground shadow-sm"
									: "bg-muted text-muted-foreground hover:bg-muted/70"
							}`}
						>
							Per Transaksi
						</button>
						<button
							type="button"
							onClick={() => setTableViewMode("item")}
							className={`rounded-md px-2.5 py-1.5 font-semibold text-[11px] transition-colors ${
								tableViewMode === "item"
									? "bg-primary text-primary-foreground shadow-sm"
									: "bg-muted text-muted-foreground hover:bg-muted/70"
							}`}
						>
							Per Item
						</button>
						{tableViewMode === "item" && (
							<>
								<button
									type="button"
									onClick={() => setGroupMode("grouped")}
									className={`rounded-md px-2.5 py-1.5 font-semibold text-[11px] transition-colors ${
										groupMode === "grouped"
											? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30"
											: "bg-muted text-muted-foreground hover:bg-muted/70"
									}`}
								>
									Grouped
								</button>
								<button
									type="button"
									onClick={() => setGroupMode("flat")}
									className={`rounded-md px-2.5 py-1.5 font-semibold text-[11px] transition-colors ${
										groupMode === "flat"
											? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30"
											: "bg-muted text-muted-foreground hover:bg-muted/70"
									}`}
								>
									Flat
								</button>
							</>
						)}
					</div>
				</div>

				<div className="p-0">
					<TransactionDetailReport
						range={dashboardRange}
						viewMode={tableViewMode}
						groupMode={groupMode}
					/>
				</div>
			</div>

			<NewTransactionDialog
				isOpen={isDialogOpen}
				onClose={() => {
					setIsDialogOpen(false);
				}}
			/>
		</div>
	);
}
