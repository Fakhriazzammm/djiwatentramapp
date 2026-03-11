import { useState } from "react";
import { Calendar } from "lucide-react";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subDays, format } from "date-fns";
import { id } from "date-fns/locale";

export type PeriodOption = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "this_year" | "custom";

export interface DateRange {
	startDate: number;
	endDate: number;
	label: string;
}

interface PeriodSelectorProps {
	value: PeriodOption;
	onChange: (period: PeriodOption, range: DateRange) => void;
}

function getRangeFromPeriod(period: PeriodOption, customStart?: Date, customEnd?: Date): DateRange {
	const now = new Date();
	switch (period) {
		case "today":
			return {
				startDate: startOfDay(now).getTime(),
				endDate: endOfDay(now).getTime(),
				label: "Hari Ini",
			};
		case "yesterday": {
			const y = subDays(now, 1);
			return {
				startDate: startOfDay(y).getTime(),
				endDate: endOfDay(y).getTime(),
				label: "Kemarin",
			};
		}
		case "this_week": {
			const day = now.getDay();
			const diff = day === 0 ? -6 : 1 - day;
			const monday = new Date(now);
			monday.setDate(now.getDate() + diff);
			return {
				startDate: startOfDay(monday).getTime(),
				endDate: endOfDay(now).getTime(),
				label: "Minggu Ini",
			};
		}
		case "this_month":
			return {
				startDate: startOfMonth(now).getTime(),
				endDate: endOfMonth(now).getTime(),
				label: format(now, "MMMM yyyy", { locale: id }),
			};
		case "last_month": {
			const lm = subMonths(now, 1);
			return {
				startDate: startOfMonth(lm).getTime(),
				endDate: endOfMonth(lm).getTime(),
				label: format(lm, "MMMM yyyy", { locale: id }),
			};
		}
		case "this_year":
			return {
				startDate: startOfYear(now).getTime(),
				endDate: endOfYear(now).getTime(),
				label: `Tahun ${now.getFullYear()}`,
			};
		case "custom":
			if (customStart && customEnd) {
				return {
					startDate: startOfDay(customStart).getTime(),
					endDate: endOfDay(customEnd).getTime(),
					label: `${format(customStart, "d MMM yyyy", { locale: id })} – ${format(customEnd, "d MMM yyyy", { locale: id })}`,
				};
			}
			return getRangeFromPeriod("this_month");
		default:
			return getRangeFromPeriod("this_month");
	}
}

export { getRangeFromPeriod };

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
	{ value: "today", label: "Hari Ini" },
	{ value: "yesterday", label: "Kemarin" },
	{ value: "this_week", label: "Minggu Ini" },
	{ value: "this_month", label: "Bulan Ini" },
	{ value: "last_month", label: "Bulan Lalu" },
	{ value: "this_year", label: "Tahun Ini" },
	{ value: "custom", label: "Custom" },
];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
	const [customStart, setCustomStart] = useState<string>("");
	const [customEnd, setCustomEnd] = useState<string>("");

	const handlePeriodChange = (period: PeriodOption) => {
		if (period !== "custom") {
			onChange(period, getRangeFromPeriod(period));
		} else {
			onChange(period, getRangeFromPeriod("this_month"));
		}
	};

	const handleCustomApply = () => {
		if (customStart && customEnd) {
			const start = new Date(customStart);
			const end = new Date(customEnd);
			onChange("custom", getRangeFromPeriod("custom", start, end));
		}
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
			<div className="flex flex-wrap gap-1">
				{PERIOD_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type="button"
						onClick={() => handlePeriodChange(opt.value)}
						className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
							value === opt.value
								? "bg-primary text-primary-foreground"
								: "bg-muted text-muted-foreground hover:bg-muted/70"
						}`}
					>
						{opt.label}
					</button>
				))}
			</div>
			{value === "custom" && (
				<div className="flex items-center gap-2">
					<input
						type="date"
						value={customStart}
						onChange={(e) => setCustomStart(e.target.value)}
						className="rounded border border-border bg-background px-2 py-1 text-xs"
					/>
					<span className="text-muted-foreground text-xs">–</span>
					<input
						type="date"
						value={customEnd}
						onChange={(e) => setCustomEnd(e.target.value)}
						className="rounded border border-border bg-background px-2 py-1 text-xs"
					/>
					<button
						type="button"
						onClick={handleCustomApply}
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
					>
						Terapkan
					</button>
				</div>
			)}
		</div>
	);
}
