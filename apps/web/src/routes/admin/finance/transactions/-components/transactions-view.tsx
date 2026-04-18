import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { FileText, Plus } from "lucide-react";
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

	return (
		<div className="space-y-2">
			<div className="sticky top-0 z-20 overflow-hidden rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-3xl font-semibold tracking-tight">Riwayat Transaksi</h2>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void handleExportPdf()}
							disabled={!txData || isExporting}
							className="inline-flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-5 text-base font-semibold hover:bg-muted disabled:opacity-50"
						>
							<FileText className="h-5 w-5" />
							PDF
						</button>
						<button
							type="button"
							onClick={() => setIsAddDialogOpen(true)}
							className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700"
						>
							<Plus className="h-5 w-5" />
							Catat Transaksi
						</button>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap items-center gap-2">
					{periodButtons.map((item) => (
						<button
							key={item.value}
							type="button"
							onClick={() => handlePeriodChange(item.value, getRangeFromPeriod(item.value))}
							className={`rounded-full border px-5 py-2 text-base font-medium transition-colors ${
								period === item.value
									? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
									: "border-input bg-background text-foreground hover:bg-muted"
							}`}
						>
							{item.label}
						</button>
					))}
				</div>

				<div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
					<div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
						<p className="text-sm text-muted-foreground">Total Pemasukan</p>
						<p className="mt-1 text-3xl font-semibold text-emerald-600">
							Rp {txData?.totalIncome?.toLocaleString("id-ID") || "0"}
						</p>
					</div>
					<div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
						<p className="text-sm text-muted-foreground">Total Pengeluaran</p>
						<p className="mt-1 text-3xl font-semibold text-orange-600">
							Rp {txData?.totalExpense?.toLocaleString("id-ID") || "0"}
						</p>
					</div>
					<div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
						<p className="text-sm text-muted-foreground">Saldo Bersih</p>
						<p className="mt-1 text-3xl font-semibold text-foreground">
							Rp {Math.abs(txData?.netBalance || 0).toLocaleString("id-ID")}
						</p>
					</div>
					<div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
						<p className="text-sm text-muted-foreground">Jumlah Transaksi</p>
						<p className="mt-1 text-3xl font-semibold text-foreground">{txData?.count || 0}</p>
					</div>
				</div>

				<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span>Periode aktif: {dateRange.label}</span>
					<span>•</span>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setViewMode("transaction")}
							className={`rounded border px-2 py-1 ${viewMode === "transaction" ? "bg-primary/10 text-primary" : "bg-background"}`}
						>
							Transaksi
						</button>
						<button
							type="button"
							onClick={() => setViewMode("item")}
							className={`rounded border px-2 py-1 ${viewMode === "item" ? "bg-primary/10 text-primary" : "bg-background"}`}
						>
							Item
						</button>
						{viewMode === "item" && (
							<>
								<button
									type="button"
									onClick={() => setGroupMode("grouped")}
									className={`rounded border px-2 py-1 ${groupMode === "grouped" ? "bg-primary/10 text-primary" : "bg-background"}`}
								>
									Grouped
								</button>
								<button
									type="button"
									onClick={() => setGroupMode("flat")}
									className={`rounded border px-2 py-1 ${groupMode === "flat" ? "bg-primary/10 text-primary" : "bg-background"}`}
								>
									Flat
								</button>
							</>
						)}
					</div>
				</div>
			</div>

			<div id="report-content" className="overflow-hidden rounded-xl border border-border bg-card">
				<div className="border-b border-border px-4 py-2">
					<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Daftar Transaksi Detail</h3>
				</div>
				<TransactionDetailReport range={dateRange} viewMode={viewMode} groupMode={groupMode} />
			</div>

			<NewTransactionDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
		</div>
	);
}

