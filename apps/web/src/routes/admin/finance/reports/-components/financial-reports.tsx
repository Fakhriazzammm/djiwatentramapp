import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer, TrendingUp, ArrowLeftRight, Users, Image as ImageIcon } from "lucide-react";
import { PeriodSelector, getRangeFromPeriod, type PeriodOption, type DateRange } from "./period-selector";
import { ProfitLossReport } from "./profit-loss-report";
import { CashFlowReport } from "./cash-flow-report";
import { ShiftReport } from "./shift-report";
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
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(getRangeFromPeriod("this_month"));
	const [isExporting, setIsExporting] = useState(false);

	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Toko";

	// Prefetch data for export
	const plData = useQuery(api.finance.getProfitLossReport, {
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
	});
	const cfData = useQuery(api.finance.getCashFlowReport, {
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

	const canExport = (activeTab === "profit_loss" && !!plData) ||
		(activeTab === "cash_flow" && !!cfData);

	return (
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-6 duration-500">
			{/* Header */}
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<h2 className="font-bold text-2xl tracking-tight">Laporan Keuangan</h2>
					<p className="text-muted-foreground text-sm">
						Laporan lengkap laba rugi, arus kas, dan riwayat transaksi
					</p>
				</div>
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
						onClick={() => handleExport("jpg")}
						disabled={!canExport || isExporting || activeTab !== "profit_loss"}
						className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-40 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400"
					>
						<ImageIcon className="h-3.5 w-3.5" />
						JPG
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

			{/* Period Selector */}
			<div className="rounded-xl border border-border bg-card px-4 py-3">
				<PeriodSelector value={period} onChange={handlePeriodChange} />
				<p className="mt-2 text-xs text-muted-foreground">
					Periode aktif: <span className="font-semibold text-foreground">{dateRange.label}</span>
				</p>
			</div>

			{/* Tabs */}
			<div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
				{TABS.map((tab) => (
					<button
						key={tab.value}
						type="button"
						onClick={() => setActiveTab(tab.value)}
						className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
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

			{/* Report Content */}
			<div id="report-content">
				{activeTab === "profit_loss" && <ProfitLossReport range={dateRange} />}
				{activeTab === "cash_flow" && <CashFlowReport range={dateRange} />}
				{activeTab === "shift" && <ShiftReport range={dateRange} />}
			</div>
		</div>
	);
}
