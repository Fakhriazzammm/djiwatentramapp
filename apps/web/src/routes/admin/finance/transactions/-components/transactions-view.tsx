import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer, Wallet, Plus, ArrowUpRight, ArrowDownLeft, TrendingUp } from "lucide-react";
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
	const [isExporting, setIsExporting] = useState(false);
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Toko";

	const txData = useQuery(api.finance.getTransactionDetailReport, {
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
	});

	const handlePeriodChange = (p: PeriodOption, range: DateRange) => {
		setPeriod(p);
		setDateRange(range);
	};

	const handleExport = async (format: "pdf" | "excel" | "csv") => {
		setIsExporting(true);
		try {
			if (txData) {
				const transactions = txData.transactions as TransactionRow[];
				const totals = { totalIncome: txData.totalIncome, totalExpense: txData.totalExpense, netBalance: txData.netBalance };
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
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-6 duration-500">
			{/* Header */}
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="font-bold text-2xl tracking-tight">Riwayat Transaksi</h2>
					<p className="text-muted-foreground text-sm">
						Pantau semua pemasukan dan pengeluaran secara detail
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => setIsAddDialogOpen(true)}
						className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
					>
						<Plus className="h-4 w-4" />
						Catat Transaksi
					</button>
					<div className="h-8 w-px bg-border mx-1 hidden sm:block" />
					{/* Export Buttons */}
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => handleExport("pdf")}
							disabled={!canExport || isExporting}
							className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-40 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400"
						>
							<FileText className="h-3.5 w-3.5" />
							PDF
						</button>
						<button
							type="button"
							onClick={() => handleExport("excel")}
							disabled={!canExport || isExporting}
							className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-40 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400"
						>
							<FileSpreadsheet className="h-3.5 w-3.5" />
							Excel
						</button>
						<button
							type="button"
							onClick={() => handleExport("csv")}
							disabled={!canExport || isExporting}
							className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400"
						>
							<Download className="h-3.5 w-3.5" />
							CSV
						</button>
						<button
							type="button"
							onClick={handlePrint}
							className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70"
						>
							<Printer className="h-3.5 w-3.5" />
							Print
						</button>
					</div>
				</div>
			</div>

			{/* Mini Dashboard Summary */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Pemasukan</span>
						<div className="rounded-full bg-green-500/10 p-2 text-green-600">
							<ArrowUpRight className="h-4 w-4" />
						</div>
					</div>
					<div className="flex flex-col">
						<span className="text-2xl font-bold text-green-600">
							{txData ? formatCurrencyIDR(txData.totalIncome) : "Rp0"}
						</span>
						<span className="text-[10px] text-muted-foreground mt-1">Dari {txData?.transactions.filter((t: any) => t.type === 'income').length || 0} transaksi</span>
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Pengeluaran</span>
						<div className="rounded-full bg-red-500/10 p-2 text-red-600">
							<ArrowDownLeft className="h-4 w-4" />
						</div>
					</div>
					<div className="flex flex-col">
						<span className="text-2xl font-bold text-red-600">
							{txData ? formatCurrencyIDR(txData.totalExpense) : "Rp0"}
						</span>
						<span className="text-[10px] text-muted-foreground mt-1">Dari {txData?.transactions.filter((t: any) => t.type === 'expense').length || 0} transaksi</span>
					</div>
				</div>

				<div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo Bersih</span>
						<div className="rounded-full bg-primary/10 p-2 text-primary">
							<TrendingUp className="h-4 w-4" />
						</div>
					</div>
					<div className="flex flex-col">
						<span className={`text-2xl font-bold ${(txData?.netBalance || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
							{txData ? formatCurrencyIDR(txData.netBalance) : "Rp0"}
						</span>
						<span className="text-[10px] text-muted-foreground mt-1">Selisih arus kas</span>
					</div>
				</div>
			</div>

			{/* Period Selector */}
			<div className="rounded-xl border border-border bg-card px-4 py-3">
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div className="flex-1">
						<PeriodSelector value={period} onChange={handlePeriodChange} />
						<p className="mt-2 text-xs text-muted-foreground">
							Periode aktif: <span className="font-semibold text-foreground">{dateRange.label}</span>
						</p>
					</div>
				</div>
			</div>

			{/* Report Content */}
			<div id="report-content" className="bg-card rounded-xl border border-border overflow-hidden">
				<div className="p-4 border-b border-border bg-muted/20">
					<h3 className="font-semibold text-sm">Daftar Transaksi Detail</h3>
				</div>
				<div className="p-0">
					<TransactionDetailReport range={dateRange} />
				</div>
			</div>

			<NewTransactionDialog 
				isOpen={isAddDialogOpen} 
				onClose={() => setIsAddDialogOpen(false)} 
			/>
		</div>
	);
}
