import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { useTheme } from "next-themes";
import { getRangeFromPeriod, type PeriodOption, type DateRange } from "../../reports/-components/period-selector";
import { TransactionDetailReport } from "./transaction-detail-report";
import { NewTransactionDialog } from "../../-components/new-transaction-dialog";
import {
	exportTransactionsPDF,
	type TransactionRow,
} from "@/lib/export-utils";

export function TransactionsView() {
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(getRangeFromPeriod("this_month"));
	const [viewMode, setViewMode] = useState<"transaction" | "item">("item");
	const [groupMode, setGroupMode] = useState<"flat" | "grouped">("grouped");
	const [exportMode] = useState<"transaction" | "item">("item");
	const [isExporting, setIsExporting] = useState(false);
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const { setTheme } = useTheme();

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

	const handleExportPdf = async () => {
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
				exportTransactionsPDF(transactions, storeName, dateRange.label, totals);
			}
		} finally {
			setIsExporting(false);
		}
	};

	const periodButtons: Array<{ value: PeriodOption; label: string }> = [
		{ value: "today", label: "Hari Ini" },
		{ value: "yesterday", label: "Kemarin" },
		{ value: "this_week", label: "Minggu Ini" },
		{ value: "this_month", label: "Bulan Ini" },
		{ value: "last_month", label: "Bulan Lalu" },
		{ value: "this_year", label: "Tahun Ini" },
		{ value: "custom", label: "Custom" },
	];

	useEffect(() => {
		setTheme("light");
	}, [setTheme]);

	return (
		<div className="space-y-2 bg-white text-slate-900">
			<div className="sticky top-0 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
					<h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Riwayat Transaksi</h2>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void handleExportPdf()}
							disabled={!txData || isExporting}
							className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
						>
							<FileText className="h-4 w-4" />
							PDF
						</button>
						<button
							type="button"
							onClick={() => setIsAddDialogOpen(true)}
							className="inline-flex h-8 items-center gap-2 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
						>
							<Plus className="h-4 w-4" />
							Catat Transaksi
						</button>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
					<div className="flex flex-wrap items-center gap-1">
						{periodButtons.map((item) => (
							<button
								key={item.value}
								type="button"
								onClick={() => handlePeriodChange(item.value, getRangeFromPeriod(item.value))}
								className={`rounded-sm border px-2.5 py-1 text-[11px] font-medium transition-colors ${
									period === item.value
										? "border-emerald-500 bg-emerald-50 text-emerald-700"
										: "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
								}`}
							>
								{item.label}
							</button>
						))}
					</div>

					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setViewMode("transaction")}
							className={`rounded-sm border px-2 py-1 text-[11px] ${
								viewMode === "transaction"
									? "border-blue-500 bg-blue-50 font-semibold text-blue-700"
									: "border-slate-300 bg-white text-slate-600"
							}`}
						>
							Transaksi
						</button>
						<button
							type="button"
							onClick={() => setViewMode("item")}
							className={`rounded-sm border px-2 py-1 text-[11px] ${
								viewMode === "item"
									? "border-blue-500 bg-blue-50 font-semibold text-blue-700"
									: "border-slate-300 bg-white text-slate-600"
							}`}
						>
							Item
						</button>
						{viewMode === "item" && (
							<>
								<button
									type="button"
									onClick={() => setGroupMode("grouped")}
									className={`rounded-sm border px-2 py-1 text-[11px] ${
										groupMode === "grouped"
											? "border-slate-500 bg-slate-100 font-semibold text-slate-800"
											: "border-slate-300 bg-white text-slate-600"
									}`}
								>
									Grouped
								</button>
								<button
									type="button"
									onClick={() => setGroupMode("flat")}
									className={`rounded-sm border px-2 py-1 text-[11px] ${
										groupMode === "flat"
											? "border-slate-500 bg-slate-100 font-semibold text-slate-800"
											: "border-slate-300 bg-white text-slate-600"
									}`}
								>
									Flat
								</button>
							</>
						)}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-4 bg-slate-50 px-3 py-2 text-[11px]">
					<span className="text-slate-500">Periode: {dateRange.label}</span>
					<span className="font-medium text-emerald-700">
						Pemasukan Rp {txData?.totalIncome?.toLocaleString("id-ID") || "0"}
					</span>
					<span className="font-medium text-orange-700">
						Pengeluaran Rp {txData?.totalExpense?.toLocaleString("id-ID") || "0"}
					</span>
					<span className="font-semibold text-slate-700">
						Saldo Rp {Math.abs(txData?.netBalance || 0).toLocaleString("id-ID")}
					</span>
					<span className="text-slate-600">Transaksi {txData?.count || 0}</span>
				</div>
			</div>

			<div id="report-content" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-200 px-3 py-2">
					<h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Daftar Transaksi Detail</h3>
				</div>
				<TransactionDetailReport range={dateRange} viewMode={viewMode} groupMode={groupMode} />
			</div>

			<NewTransactionDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
		</div>
	);
}
