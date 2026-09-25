import { useState } from "react";
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
					<h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
						Laporan Shift
					</h1>
					<p className="mt-1 text-xs text-muted-foreground">
						Ringkasan operasional · {dateRange.label} · WIB
					</p>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-card p-2">
				<PeriodSelector value={period} onChange={handlePeriodChange} />
			</div>

			<ShiftReport range={dateRange} preferredSelectedStartTime={selectedStartTime} />
		</div>
	);
}
