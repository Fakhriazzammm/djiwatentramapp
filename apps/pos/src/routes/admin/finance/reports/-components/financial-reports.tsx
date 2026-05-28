import { useState } from "react";
import { FileSpreadsheet, FileText, Printer, TrendingUp, ArrowLeftRight, Users, Image as ImageIcon, Mail, Focus } from "lucide-react";
import { PeriodSelector, getRangeFromPeriod, type PeriodOption, type DateRange } from "./period-selector";
import { ProfitLossReport } from "./profit-loss-report";
import { CashFlowReport } from "./cash-flow-report";
import { ShiftReport } from "./shift-report";
import { toast } from "sonner";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import {
	useHybridCashFlowReport,
	useHybridProfitLossReport,
} from "@/hooks/use-hybrid-finance-analytics-data";
import { useHybridSendDailySummaryEmail } from "@/hooks/use-hybrid-write-actions";
import {
	exportProfitLossPDF,
	exportCashFlowPDF,
	exportProfitLossExcel,
	exportCashFlowExcel,
	exportProfitLossJPG,
	type ProfitLossData,
	type CashFlowData,
} from "@/lib/export-utils";

type ReportTab = "profit_loss" | "cash_flow" | "shift";

const TABS: { value: ReportTab; label: string; icon: React.ReactNode }[] = [
	{ value: "profit_loss", label: "Laba Rugi", icon: <TrendingUp className="h-4 w-4" /> },
	{ value: "cash_flow", label: "Arus Kas", icon: <ArrowLeftRight className="h-4 w-4" /> },
	{ value: "shift", label: "Laporan Shift", icon: <Users className="h-4 w-4" /> },
];

export function FinancialReports() {
	const [activeTab, setActiveTab] = useState<ReportTab>("profit_loss");
	const [focusMode, setFocusMode] = useState(true);
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(getRangeFromPeriod("this_month"));
	const [isExporting, setIsExporting] = useState(false);
	const [isSendingEmail, setIsSendingEmail] = useState(false);
	const sendDailySummaryEmail = useHybridSendDailySummaryEmail();

	const settings = useHybridSiteSettings();
	const storeName = settings?.storeName || "Toko";

	// Prefetch data for export
	const plData = useHybridProfitLossReport({
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
	});
	const cfData = useHybridCashFlowReport({
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
	});

	const handlePeriodChange = (p: PeriodOption, range: DateRange) => {
		setPeriod(p);
		setDateRange(range);
	};

	const handleExport = async (format: "pdf" | "excel" | "csv" | "jpg") => {
		setIsExporting(true);
		try {
			if (activeTab === "profit_loss" && plData) {
				if (format === "pdf") exportProfitLossPDF(plData as ProfitLossData, storeName, dateRange.label);
				else if (format === "excel") exportProfitLossExcel(plData as ProfitLossData, storeName, dateRange.label);
				else if (format === "jpg") exportProfitLossJPG(plData as ProfitLossData, storeName, dateRange.label);
			} else if (activeTab === "cash_flow" && cfData) {
				if (format === "pdf") exportCashFlowPDF(cfData as CashFlowData, storeName, dateRange.label);
				else exportCashFlowExcel(cfData as CashFlowData, storeName, dateRange.label);
			}
		} finally {
			setIsExporting(false);
		}
	};

	const handlePrint = () => {
		window.print();
	};

	const handleSendEmail = async () => {
		if (!plData || !cfData) {
			toast.error("Data laporan belum siap");
			return;
		}

		setIsSendingEmail(true);
		try {
			await sendDailySummaryEmail({
				storeName,
				periodLabel: dateRange.label,
				totalIncome: plData.income.total,
				totalExpense: plData.expense.total,
				netProfit: plData.netProfit,
				totalInflow: cfData.totalInflow,
				totalOutflow: cfData.totalOutflow,
				netCashFlow: cfData.netCashFlow,
				transactionCount: plData.transactionCount || 0,
			});
			toast.success("Laporan berhasil dikirim ke email admin");
		} catch (error) {
			console.error("Daily summary email failed:", error);
			const message =
				error instanceof Error
					? error.message
					: "Gagal kirim email laporan. Cek konfigurasi Resend.";
			toast.error(message);
		} finally {
			setIsSendingEmail(false);
		}
	};

	const canExport = (activeTab === "profit_loss" && !!plData) ||
		(activeTab === "cash_flow" && !!cfData);

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div>
					<h2 className="font-semibold text-lg tracking-tight">Laporan Keuangan</h2>
					<p className="text-muted-foreground text-xs">
						Laporan laba rugi, arus kas, dan shift dengan layout operasional ringkas.
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
					<button
						type="button"
						onClick={() => handleExport("pdf")}
						disabled={!canExport || isExporting}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-40 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400"
					>
						<FileText className="h-3.5 w-3.5" />
						PDF
					</button>
					<button
						type="button"
						onClick={() => handleExport("excel")}
						disabled={!canExport || isExporting}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 text-[11px] font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-40 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400"
					>
						<FileSpreadsheet className="h-3.5 w-3.5" />
						Excel
					</button>
					<button
						type="button"
						onClick={() => handleExport("jpg")}
						disabled={!canExport || isExporting || activeTab !== "profit_loss" || focusMode}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-2.5 text-[11px] font-semibold text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-40 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400"
					>
						<ImageIcon className="h-3.5 w-3.5" />
						JPG
					</button>
					<button
						type="button"
						onClick={handlePrint}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/70"
					>
						<Printer className="h-3.5 w-3.5" />
						Print
					</button>
					<button
						type="button"
						onClick={handleSendEmail}
						disabled={!plData || !cfData || isSendingEmail || focusMode}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400"
					>
						<Mail className="h-3.5 w-3.5" />
						{isSendingEmail ? "Mengirim..." : "Kirim Email"}
					</button>
				</div>
			</div>
			</div>

			<div className="rounded-xl border border-border bg-card px-3 py-3">
				<PeriodSelector value={period} onChange={handlePeriodChange} />
				<p className="mt-1 text-[11px] text-muted-foreground">
					Periode aktif: <span className="font-semibold text-foreground">{dateRange.label}</span>
				</p>
				{focusMode && (
					<p className="mt-1 text-[10px] text-muted-foreground">
						Mode fokus aktif: menampilkan alur utama review laporan.
					</p>
				)}
			</div>

			<div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
				{TABS.map((tab) => (
					<button
						key={tab.value}
						type="button"
						onClick={() => setActiveTab(tab.value)}
						className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
							activeTab === tab.value
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{tab.icon}
						<span className="hidden md:inline">{tab.label}</span>
					</button>
				))}
			</div>

			<div id="report-content">
				{activeTab === "profit_loss" && <ProfitLossReport range={dateRange} />}
				{activeTab === "cash_flow" && <CashFlowReport range={dateRange} />}
				{activeTab === "shift" && <ShiftReport range={dateRange} />}
			</div>
		</div>
	);
}
