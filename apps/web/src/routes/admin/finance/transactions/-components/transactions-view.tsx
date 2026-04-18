import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { getRangeFromPeriod, type PeriodOption, type DateRange } from "../../reports/-components/period-selector";
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
	const periodButtons: Array<{ value: PeriodOption; label: string }> = [
		{ value: "today", label: "Hari Ini" },
		{ value: "yesterday", label: "Kemarin" },
		{ value: "this_week", label: "Minggu Ini" },
		{ value: "this_month", label: "Bulan Ini" },
		{ value: "last_month", label: "Bulan Lalu" },
		{ value: "this_year", label: "Tahun Ini" },
		{ value: "custom", label: "Custom" },
	];
	const summaryItems = [
		{ label: "Pemasukan", value: txData ? `Rp ${txData.totalIncome.toLocaleString("id-ID")}` : "-", tone: "text-emerald-400" },
		{ label: "Pengeluaran", value: txData ? `Rp ${txData.totalExpense.toLocaleString("id-ID")}` : "-", tone: "text-rose-400" },
		{ label: "Saldo Bersih", value: txData ? `Rp ${Math.abs(txData.netBalance).toLocaleString("id-ID")}` : "-", tone: txData && txData.netBalance >= 0 ? "text-emerald-400" : "text-rose-400" },
		{ label: viewMode === "item" ? "Baris" : "Transaksi", value: txData ? `${txData.count}` : "-", tone: "text-zinc-200" },
	];

	return (
		<div className="space-y-2">
			<div className="sticky top-0 z-30 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-200">
				<div className="flex flex-col gap-2 border-zinc-800 border-b px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
					<div className="min-w-0">
						<h2 className="font-semibold text-sm tracking-wide text-zinc-100">Riwayat Transaksi</h2>
						<p className="text-[10px] text-zinc-400">Data-grid finance padat untuk monitoring dan edit cepat.</p>
					</div>
					<div className="flex flex-wrap items-center gap-1">
						<div className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-1 py-1">
							<select
								value={exportMode}
								onChange={(e) => setExportMode((e.target.value as "transaction" | "item") || "transaction")}
								className="h-7 rounded border border-zinc-700 bg-zinc-950 px-2 text-[11px] text-zinc-200"
							>
								<option value="transaction">Per transaksi</option>
								<option value="item">Per item</option>
							</select>
							<select
								value={exportFormat}
								onChange={(e) => setExportFormat((e.target.value as "pdf" | "excel" | "csv" | "print") || "excel")}
								className="h-7 rounded border border-zinc-700 bg-zinc-950 px-2 text-[11px] text-zinc-200"
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
								className="inline-flex h-7 items-center gap-1 rounded border border-zinc-600 bg-zinc-100 px-2 text-[11px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
							>
								<Download className="h-3.5 w-3.5" />
								Export
							</button>
						</div>
						<button
							type="button"
							onClick={() => setIsAddDialogOpen(true)}
							className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 bg-zinc-100 px-2.5 text-[11px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
						>
							<Plus className="h-3.5 w-3.5" />
							Catat
						</button>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-1 border-zinc-800 border-b px-3 py-1.5">
					{periodButtons.map((item) => (
						<button
							key={item.value}
							type="button"
							onClick={() => handlePeriodChange(item.value, getRangeFromPeriod(item.value))}
							className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
								period === item.value
									? "border border-zinc-500 bg-zinc-700 text-zinc-100"
									: "border border-transparent text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
							}`}
						>
							{item.label}
						</button>
					))}
					<div className="ml-auto flex flex-wrap items-center gap-1">
						<button
							type="button"
							onClick={() => setViewMode("transaction")}
							className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
								viewMode === "transaction"
									? "border-zinc-500 bg-zinc-700 text-zinc-100"
									: "border-zinc-700 text-zinc-400 hover:text-zinc-100"
							}`}
						>
							Transaksi
						</button>
						<button
							type="button"
							onClick={() => setViewMode("item")}
							className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
								viewMode === "item"
									? "border-zinc-500 bg-zinc-700 text-zinc-100"
									: "border-zinc-700 text-zinc-400 hover:text-zinc-100"
							}`}
						>
							Item
						</button>
						{viewMode === "item" && (
							<>
								<button
									type="button"
									onClick={() => setGroupMode("grouped")}
									className={`rounded border px-2 py-1 text-[10px] ${
										groupMode === "grouped"
											? "border-zinc-500 bg-zinc-700 text-zinc-100"
											: "border-zinc-700 text-zinc-400 hover:text-zinc-100"
									}`}
								>
									Grouped
								</button>
								<button
									type="button"
									onClick={() => setGroupMode("flat")}
									className={`rounded border px-2 py-1 text-[10px] ${
										groupMode === "flat"
											? "border-zinc-500 bg-zinc-700 text-zinc-100"
											: "border-zinc-700 text-zinc-400 hover:text-zinc-100"
									}`}
								>
									Flat
								</button>
							</>
						)}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-3 overflow-x-auto px-3 py-1.5">
					{summaryItems.map((item) => (
						<div key={item.label} className="flex items-center gap-1.5 whitespace-nowrap border-zinc-800 border-r pr-3 text-[11px] last:border-r-0">
							<span className="text-zinc-500">{item.label}</span>
							<span className={`font-mono font-semibold ${item.tone}`}>{item.value}</span>
						</div>
					))}
					<div className="ml-auto text-[10px] text-zinc-500">
						Periode aktif: <span className="font-semibold text-zinc-300">{dateRange.label}</span>
					</div>
				</div>
			</div>

			<div id="report-content" className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-200">
				<div className="border-zinc-800 border-b px-3 py-1.5">
					<h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Daftar Transaksi Detail</h3>
				</div>
				<TransactionDetailReport range={dateRange} viewMode={viewMode} groupMode={groupMode} />
			</div>

			<NewTransactionDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
		</div>
	);
}
