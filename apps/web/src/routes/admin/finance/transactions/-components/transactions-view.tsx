import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
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
			<TransactionDetailReport
				range={dateRange}
				viewMode={viewMode}
				groupMode={groupMode}
				period={period}
				periodButtons={periodButtons}
				onPeriodChange={(value) => handlePeriodChange(value, getRangeFromPeriod(value))}
				onViewModeChange={setViewMode}
				onGroupModeChange={setGroupMode}
				onExportPdf={() => void handleExportPdf()}
				isExporting={isExporting}
				onOpenAddTransaction={() => setIsAddDialogOpen(true)}
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
