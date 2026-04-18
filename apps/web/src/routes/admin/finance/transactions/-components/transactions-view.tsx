import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { PeriodSelector, getRangeFromPeriod, type PeriodOption, type DateRange } from "../../reports/-components/period-selector";
import { TransactionDetailReport } from "./transaction-detail-report";
import { NewTransactionDialog } from "../../-components/new-transaction-dialog";
import {
	exportTransactionsPDF,
	exportTransactionsExcel,
	exportTransactionsCSV,
	type TransactionRow,
} from "@/lib/export-utils";

export function TransactionsView() {
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(getRangeFromPeriod("this_month"));
	const [viewMode, setViewMode] = useState<"transaction" | "item">("item");
	const [groupMode, setGroupMode] = useState<"flat" | "grouped">("grouped");
	const [exportMode, setExportMode] = useState<"transaction" | "item">("item");
	const [exportFormat, setExportFormat] = useState<"pdf" | "excel" | "csv" | "print">("excel");
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

	const handleExportAction = async () => {
		if (exportFormat === "print") {
			window.print();
			return;
		}
		await handleExport(exportFormat);
	};

	const canExport = !!txData;

	return (
		<div className="space-y-2">
			<div className="sticky top-0 z-30 flex flex-col gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/85">
				<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="font-semibold text-base tracking-tight">Riwayat Transaksi</h2>
						<p className="text-[10px] text-muted-foreground">Tampilan ringkas untuk monitoring dan edit cepat.</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => setIsAddDialogOpen(true)}
							className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[10px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
						>
							<Plus className="h-3.5 w-3.5" />
							Catat Transaksi
						</button>
						<div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
							<select
								value={exportMode}
								onChange={(e) => setExportMode((e.target.value as "transaction" | "item") || "transaction")}
								className="h-6 rounded border border-input bg-background px-2 text-[10px]"
							>
								<option value="transaction">Per Transaksi</option>
								<option value="item">Per Item</option>
							</select>
							<select
								value={exportFormat}
								onChange={(e) =>
									setExportFormat((e.target.value as "pdf" | "excel" | "csv" | "print") || "excel")
								}
								className="h-6 rounded border border-input bg-background px-2 text-[10px]"
							>
								<option value="excel">Excel</option>
								<option value="pdf">PDF</option>
								<option value="csv">CSV</option>
								<option value="print">Print</option>
							</select>
							<button
								type="button"
								onClick={() => void handleExportAction()}
								disabled={!canExport || isExporting}
								className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
							>
								<Download className="h-3 w-3" />
								Export
							</button>
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
					</div>
				</div>
			</div>

			<div id="report-content" className="overflow-hidden rounded-xl border border-border bg-card">
				<div className="border-border border-b bg-muted/20 px-3 py-2">
					<h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Daftar Transaksi Detail</h3>
				</div>
				<div className="p-0">
					<TransactionDetailReport range={dateRange} viewMode={viewMode} groupMode={groupMode} />
				</div>
			</div>

			<NewTransactionDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
		</div>
	);
}
