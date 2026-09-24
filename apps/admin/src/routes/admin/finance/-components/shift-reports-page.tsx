import { useState } from "react";
import { Users } from "lucide-react";
import {
	PeriodSelector,
	getRangeFromPeriod,
	type DateRange,
	type PeriodOption,
} from "../reports/-components/period-selector";
import { ShiftReport } from "../reports/-components/shift-report";

export function ShiftReportsPage({ selectedStartTime }: { selectedStartTime?: number }) {
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(
		getRangeFromPeriod("this_month"),
	);

	const handlePeriodChange = (nextPeriod: PeriodOption, range: DateRange) => {
		setPeriod(nextPeriod);
		setDateRange(range);
	};

	return (
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-4 duration-500">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
						<Users className="h-3.5 w-3.5 shrink-0" />
						<span>Laporan Shift</span>
					</div>
					<h1 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
						Ringkasan Shift
					</h1>
					<p className="mt-1 text-xs text-muted-foreground">
						{dateRange.label}
					</p>
				</div>
				<div className="shrink-0 text-right text-[11px] text-muted-foreground">
					<div className="font-semibold text-foreground">Laporan keuangan</div>
					<div>WIB · data aktual</div>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-card p-2">
				<PeriodSelector value={period} onChange={handlePeriodChange} />
			</div>

			<ShiftReport range={dateRange} preferredSelectedStartTime={selectedStartTime} />
		</div>
	);
}
