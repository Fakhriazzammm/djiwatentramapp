import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import {
	ArrowDownLeft,
	ArrowUpRight,
	Download,
	FileSpreadsheet,
	FileText,
	Focus,
	Plus,
	Printer,
	TrendingUp,
} from "lucide-react";
import { PeriodSelector, getRangeFromPeriod, type PeriodOption, type DateRange } from "../../reports/-components/period-selector";
import { TransactionDetailReport } from "./transaction-detail-report";
import { NewTransactionDialog } from "../../-components/new-transaction-dialog";
import {
	exportTransactionsPDF,
	exportTransactionsExcel,
	exportTransactionsCSV,
	type TransactionRow,
	formatCurrencyIDR,
} from "@/lib/export-utils";

export function TransactionsView() {
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(getRangeFromPeriod("this_month"));
	const [viewMode, setViewMode] = useState<"transaction" | "item">("item");
	const [groupMode, setGroupMode] = useState<"flat" | "grouped">("grouped");
	const [exportMode, setExportMode] = useState<"transaction" | "item">("item");
	const [focusMode, setFocusMode] = useState(true);
	const [isExporting, setIsExporting] = useState(false);
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Toko";

	const txData = useQuery(api.finance.getTransactionDetailReport, {
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
		viewMode,
		page: 1,
		pageSize: 200,
	});
	const txExportTransaction = useQuery(api.finance.getTransactionDetailReport, {
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
		viewMode: "transaction",
		page: 1,
		pageSize: 500,
	});
	const txExportItem = useQuery(api.finance.getTransactionDetailReport, {
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
		viewMode: "item",
		page: 1,
		pageSize: 500,
	});

	const handlePeriodChange = (p: PeriodOption, range: DateRange) => {
		setPeriod(p);
		setDateRange(range);
	};

	const handleExport = async (format: "pdf" | "excel" | "csv") => {
		setIsExporting(true);
		try {
			if (txData) {
				const source = exportMode === "item" ? txExportItem : txExportTransaction;
				const transactions = ((source?.transactions || txData.transactions) as TransactionRow[]).map((row: any) => ({
					...row,
					description:
						exportMode === "item"
							? `${row.displaySummary || row.description || "-"} | ${row.receiptGroupLabel || ""}`.trim()
							: row.description,
				}));
				const totals = {
					totalIncome: source?.totalIncome ?? txData.totalIncome,
					totalExpense: source?.totalExpense ?? txData.totalExpense,
					netBalance: source?.netBalance ?? txData.netBalance,
				};
				if (format === "pdf") exportTransactionsPDF(transactions, storeName, dateRange.label, totals);
				else if (format === "excel") exportTransactionsExcel(transactions, storeName, dateRange.label, totals);
				else exportTransactionsCSV(transactions, dateRange.label);
			}
		} finally {
			setIsExporting(false);
		}
	};

	const handlePrint = () => {
		window.print();
	};

	const canExport = !!txData;

	return (
		<div className="space-y-2">
			<div className="sticky top-0 z-30 flex flex-col gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/85">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="font-semibold text-base tracking-tight">Riwayat Transaksi</h2>
						<p className="text-muted-foreground text-[10px]">
							Data-grid finance padat untuk monitoring dan edit cepat.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => setFocusMode((prev) => !prev)}
							className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold transition-colors ${
								focusMode
									? "bg-primary text-primary-foreground"
									: "border border-border bg-muted text-foreground hover:bg-muted/80"
							}`}
						>
							<Focus className="h-3.5 w-3.5" />
							{focusMode ? "Mode Fokus" : "Mode Lengkap"}
						</button>
						<button
							type="button"
							onClick={() => setIsAddDialogOpen(true)}
							className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
						>
							<Plus className="h-3.5 w-3.5" />
							Catat Transaksi
						</button>
						<div className="hidden h-7 w-px bg-border sm:block" />
						<div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1">
							<span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
								Export
							</span>
							<select
								value={exportMode}
								onChange={(e) =>
									setExportMode((e.target.value as "transaction" | "item") || "transaction")
								}
								className="h-6 rounded-md border border-input bg-background px-2 text-[10px]"
							>
								<option value="transaction">Per Transaksi</option>
								<option value="item">Per Item</option>
							</select>
						</div>
					</div>
				</div>

				<div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-2.5 py-2 lg:flex-row lg:items-center lg:justify-between">
					<div className="min-w-0 flex-1">
						<PeriodSelector value={period} onChange={handlePeriodChange} />
						<p className="mt-1 text-[10px] text-muted-foreground">
							Periode aktif: <span className="font-semibold text-foreground">{dateRange.label}</span>
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
							<button
								type="button"
								onClick={() => setViewMode("transaction")}
								className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
									viewMode === "transaction"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:bg-muted"
								}`}
							>
								Per Transaksi
							</button>
							<button
								type="button"
								onClick={() => setViewMode("item")}
								className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
									viewMode === "item"
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:bg-muted"
								}`}
							>
								Per Item
							</button>
						</div>
						{viewMode === "item" && (
							<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
								<button
									type="button"
									onClick={() => setGroupMode("grouped")}
									className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
										groupMode === "grouped"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:bg-muted"
									}`}
								>
									Grouped
								</button>
								<button
									type="button"
									onClick={() => setGroupMode("flat")}
									className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
										groupMode === "flat"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:bg-muted"
									}`}
								>
									Flat
								</button>
							</div>
						)}
						<div className="flex flex-wrap gap-1.5">
							<button
								type="button"
								onClick={() => handleExport("pdf")}
								disabled={!canExport || isExporting}
								className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-40 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400"
							>
								<FileText className="h-3.5 w-3.5" />
								PDF
							</button>
							<button
								type="button"
								onClick={() => handleExport("excel")}
								disabled={!canExport || isExporting}
								className="inline-flex h-7 items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 text-[10px] font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-40 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400"
							>
								<FileSpreadsheet className="h-3.5 w-3.5" />
								Excel
							</button>
							<button
								type="button"
								onClick={() => handleExport("csv")}
								disabled={!canExport || isExporting}
								className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[10px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400"
							>
								<Download className="h-3.5 w-3.5" />
								CSV
							</button>
							<button
								type="button"
								onClick={handlePrint}
								className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted px-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70"
							>
								<Printer className="h-3.5 w-3.5" />
								Print
							</button>
						</div>
					</div>
				</div>
			</div>

			{!focusMode && (
				<div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-2">
					<span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700">
						<ArrowUpRight className="h-3 w-3" />
						{txData ? formatCurrencyIDR(txData.totalIncome) : "Rp0"}
					</span>
					<span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">
						<ArrowDownLeft className="h-3 w-3" />
						{txData ? formatCurrencyIDR(txData.totalExpense) : "Rp0"}
					</span>
					<span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${
						(txData?.netBalance || 0) >= 0
							? "border-primary/20 bg-primary/10 text-primary"
							: "border-destructive/20 bg-destructive/10 text-destructive"
					}`}>
						<TrendingUp className="h-3 w-3" />
						{txData ? formatCurrencyIDR(txData.netBalance) : "Rp0"}
					</span>
					<span className="inline-flex rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground">
						{txData?.count || 0} baris
					</span>
				</div>
			)}

			<div id="report-content" className="overflow-hidden rounded-xl border border-border bg-card">
				<div className="border-border border-b bg-muted/20 px-3 py-2">
					<h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
						Daftar Transaksi Detail
					</h3>
				</div>
				<div className="p-0">
					<TransactionDetailReport range={dateRange} viewMode={viewMode} groupMode={groupMode} />
				</div>
			</div>

			<NewTransactionDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
		</div>
	);
}
