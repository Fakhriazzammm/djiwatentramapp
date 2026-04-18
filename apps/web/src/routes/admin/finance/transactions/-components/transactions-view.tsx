import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
	getRangeFromPeriod,
	type PeriodOption,
	type DateRange,
} from "../../reports/-components/period-selector";
import { TransactionDetailReport } from "./transaction-detail-report";
import { NewTransactionDialog } from "../../-components/new-transaction-dialog";
import {
	exportTransactionsPDF,
	exportTransactionsCSV,
	type TransactionRow,
} from "@/lib/export-utils";
import {
	subDays,
	subWeeks,
	subMonths,
	subYears,
	startOfDay,
	endOfDay,
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	startOfYear,
	endOfYear,
	format,
} from "date-fns";
import { id as localeID } from "date-fns/locale";

function getPreviousPeriodRange(
	period: PeriodOption,
	range: DateRange
): DateRange | null {
	switch (period) {
		case "today": {
			const d = subDays(new Date(range.startDate), 1);
			return {
				startDate: startOfDay(d).getTime(),
				endDate: endOfDay(d).getTime(),
				label: format(d, "dd MMM yyyy", { locale: localeID }),
			};
		}
		case "yesterday": {
			const d = subDays(new Date(range.startDate), 1);
			return {
				startDate: startOfDay(d).getTime(),
				endDate: endOfDay(d).getTime(),
				label: format(d, "dd MMM yyyy", { locale: localeID }),
			};
		}
		case "this_week": {
			const d = subWeeks(new Date(range.startDate), 1);
			return {
				startDate: startOfWeek(d, { weekStartsOn: 1 }).getTime(),
				endDate: endOfWeek(d, { weekStartsOn: 1 }).getTime(),
				label: "Minggu Lalu",
			};
		}
		case "this_month":
			return getRangeFromPeriod("last_month");
		case "last_month": {
			const d = subMonths(new Date(range.startDate), 1);
			return {
				startDate: startOfMonth(d).getTime(),
				endDate: endOfMonth(d).getTime(),
				label: format(d, "MMMM yyyy", { locale: localeID }),
			};
		}
		case "this_year": {
			const d = subYears(new Date(range.startDate), 1);
			return {
				startDate: startOfYear(d).getTime(),
				endDate: endOfYear(d).getTime(),
				label: String(d.getFullYear()),
			};
		}
		case "custom": {
			const duration = range.endDate - range.startDate;
			const end = range.startDate - 1;
			const start = end - duration;
			return { startDate: start, endDate: end, label: "Periode Sebelumnya" };
		}
		default:
			return null;
	}
}

function getAdjacentPeriod(
	period: PeriodOption,
	range: DateRange,
	direction: "prev" | "next"
): { period: PeriodOption; range: DateRange } {
	const duration = range.endDate - range.startDate + 1;
	if (direction === "prev") {
		if (period === "this_month") return { period: "last_month", range: getRangeFromPeriod("last_month") };
		const newEnd = range.startDate - 1;
		const newStart = newEnd - duration + 1;
		return {
			period: "custom",
			range: {
				startDate: newStart,
				endDate: newEnd,
				label: `${format(new Date(newStart), "dd MMM")} – ${format(new Date(newEnd), "dd MMM yyyy", { locale: localeID })}`,
			},
		};
	} else {
		const newStart = range.endDate + 1;
		const newEnd = newStart + duration - 1;
		return {
			period: "custom",
			range: {
				startDate: newStart,
				endDate: newEnd,
				label: `${format(new Date(newStart), "dd MMM")} – ${format(new Date(newEnd), "dd MMM yyyy", { locale: localeID })}`,
			},
		};
	}
}

export function TransactionsView() {
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(getRangeFromPeriod("this_month"));
	const [viewMode, setViewMode] = useState<"transaction" | "item">("item");
	const [groupMode, setGroupMode] = useState<"flat" | "grouped">("flat");
	const [exportMode] = useState<"transaction" | "item">("item");
	const [isExporting, setIsExporting] = useState(false);
	const [isExportingCsv, setIsExportingCsv] = useState(false);
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [showComparison, setShowComparison] = useState(false);
	const { setTheme } = useTheme();

	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Toko";

	const prevRange = showComparison ? getPreviousPeriodRange(period, dateRange) : null;

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
		pageSize: 2000,
	});
	const txExportItem = useQuery(api.finance.getTransactionDetailReport, {
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
		viewMode: "item",
		page: 1,
		pageSize: 2000,
	});
	const prevTxData = useQuery(
		api.finance.getTransactionDetailReport,
		prevRange
			? { startDate: prevRange.startDate, endDate: prevRange.endDate, viewMode: "transaction", page: 1, pageSize: 1 }
			: "skip"
	);

	const handlePeriodChange = (p: PeriodOption, range: DateRange) => {
		setPeriod(p);
		setDateRange(range);
	};

	const handleCustomRangeChange = (range: DateRange) => {
		setPeriod("custom");
		setDateRange(range);
	};

	const handlePrevPeriod = () => {
		const adj = getAdjacentPeriod(period, dateRange, "prev");
		setPeriod(adj.period);
		setDateRange(adj.range);
	};

	const handleNextPeriod = () => {
		const adj = getAdjacentPeriod(period, dateRange, "next");
		setPeriod(adj.period);
		setDateRange(adj.range);
	};

	const handleExportPdf = async () => {
		setIsExporting(true);
		try {
			if (txData) {
				const source = exportMode === "item" ? txExportItem : txExportTransaction;
				const transactions = ((source?.transactions || txData.transactions) as TransactionRow[]).map(
					(row: any) => ({
						...row,
						description:
							exportMode === "item"
								? `${row.displaySummary || row.description || "-"} | ${row.receiptGroupLabel || ""}`.trim()
								: row.description,
					})
				);
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

	const handleExportCsv = async () => {
		setIsExportingCsv(true);
		try {
			const source = exportMode === "item" ? txExportItem : txExportTransaction;
			const transactions = ((source?.transactions || txData?.transactions || []) as TransactionRow[]).map(
				(row: any) => ({
					...row,
					description:
						exportMode === "item"
							? `${row.displaySummary || row.description || "-"} | ${row.receiptGroupLabel || ""}`.trim()
							: row.description,
				})
			);
			exportTransactionsCSV(transactions, dateRange.label);
		} finally {
			setIsExportingCsv(false);
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

	const previousSummary =
		showComparison && prevRange
			? prevTxData
				? {
						totalIncome: prevTxData.totalIncome,
						totalExpense: prevTxData.totalExpense,
						netBalance: prevTxData.netBalance,
						periodLabel: prevRange.label,
					}
				: null // loading
			: undefined; // not shown

	return (
		<div className="space-y-2 bg-white text-slate-900">
			<TransactionDetailReport
				range={dateRange}
				viewMode={viewMode}
				groupMode={groupMode}
				period={period}
				periodButtons={periodButtons}
				onPeriodChange={(value) => handlePeriodChange(value, getRangeFromPeriod(value))}
				onCustomRangeChange={handleCustomRangeChange}
				onViewModeChange={setViewMode}
				onGroupModeChange={setGroupMode}
				onExportPdf={() => void handleExportPdf()}
				onExportCsv={() => void handleExportCsv()}
				isExporting={isExporting}
				isExportingCsv={isExportingCsv}
				onOpenAddTransaction={() => setIsAddDialogOpen(true)}
				onPrevPeriod={handlePrevPeriod}
				onNextPeriod={handleNextPeriod}
				canGoNext={dateRange.endDate < Date.now()}
				showComparison={showComparison}
				onToggleComparison={() => setShowComparison((v) => !v)}
				previousSummary={previousSummary}
				summary={{
					periodLabel: dateRange.label,
					totalIncome: txData?.totalIncome ?? 0,
					totalExpense: txData?.totalExpense ?? 0,
					netBalance: txData?.netBalance ?? 0,
					count: txData?.count ?? 0,
				}}
			/>

			<NewTransactionDialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} />
		</div>
	);
}
