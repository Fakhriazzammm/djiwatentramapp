import { useState } from "react";
import { Users } from "lucide-react";
import {
	PeriodSelector,
	getRangeFromPeriod,
	type DateRange,
	type PeriodOption,
} from "../reports/-components/period-selector";
import { ShiftReport } from "../reports/-components/shift-report";

export function ShiftReportsPage() {
	const [period, setPeriod] = useState<PeriodOption>("this_month");
	const [dateRange, setDateRange] = useState<DateRange>(
		getRangeFromPeriod("this_month"),
	);

	const handlePeriodChange = (nextPeriod: PeriodOption, range: DateRange) => {
		setPeriod(nextPeriod);
		setDateRange(range);
	};

	return (
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-6 duration-500">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div>
					<div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
						<Users className="h-3.5 w-3.5" />
						Laporan Shift
					</div>
					<h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
						Ringkasan Keuangan per Shift
					</h1>
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
						Pantau siapa yang bertugas, pemasukan shift, pengeluaran, dan
						ringkasan produk terjual dalam satu tabel yang bisa langsung dibuka
						detailnya.
					</p>
				</div>
			</div>

			<div className="rounded-2xl border border-border bg-card px-4 py-3">
				<PeriodSelector value={period} onChange={handlePeriodChange} />
				<p className="mt-2 text-xs text-muted-foreground">
					Periode aktif:{" "}
					<span className="font-semibold text-foreground">{dateRange.label}</span>
				</p>
			</div>

			<ShiftReport range={dateRange} />
		</div>
	);
}
