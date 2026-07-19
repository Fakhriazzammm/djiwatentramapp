import { useMemo, useState } from "react";
import {
	BarChart,
	Bar,
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import { BarChart3, LineChart as LineIcon } from "lucide-react";
import { useHybridShiftReportRows } from "@/hooks/use-hybrid-pos-data";
import { formatDateWIB } from "@/lib/wib-utils";

const formatCompact = (v: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
		notation: "compact",
	}).format(v);

const formatFull = (v: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(v);

export function HomeRevenueChart() {
	const shiftRows = useHybridShiftReportRows();
	const [chartType, setChartType] = useState<"bar" | "line">("bar");

	const data = useMemo(() => {
		if (!shiftRows) return [];
		// Aggregate per day (last 7 days)
		const dayMap = new Map<string, number>();
		const now = new Date();
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const key = formatDateWIB(d.getTime());
			dayMap.set(key, 0);
		}
		for (const shift of shiftRows) {
			const dayKey = formatDateWIB(shift.startTime);
			if (dayMap.has(dayKey)) {
				dayMap.set(
					dayKey,
					(dayMap.get(dayKey) || 0) + (shift.totalRevenue || 0),
				);
			}
		}
		return Array.from(dayMap.entries()).map(([label, revenue]) => ({
			label: label.split(" ")[0], // "19 Juli" -> "19"
			revenue,
		}));
	}, [shiftRows]);

	if (!shiftRows) {
		return <div className="h-48 animate-pulse rounded-xl bg-muted/50" />;
	}

	const CustomTooltip = ({ active, payload }: any) => {
		if (!active || !payload?.length) return null;
		return (
			<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
				<p className="font-semibold">{payload[0].payload.label}</p>
				<p className="text-emerald-600 font-bold">
					{formatFull(payload[0].value)}
				</p>
			</div>
		);
	};

	return (
		<div className="rounded-xl border border-border bg-card p-3">
			<div className="flex items-center justify-between mb-2">
				<h3 className="text-xs font-bold">Tren Revenue</h3>
				<div className="flex gap-1">
					<button
						type="button"
						onClick={() => setChartType("bar")}
						className={`p-1 rounded ${
							chartType === "bar"
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted"
						}`}
					>
						<BarChart3 className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={() => setChartType("line")}
						className={`p-1 rounded ${
							chartType === "line"
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted"
						}`}
					>
						<LineIcon className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>
			<ResponsiveContainer width="100%" height={160}>
				{chartType === "bar" ? (
					<BarChart data={data} barCategoryGap="20%">
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="hsl(var(--border))"
							opacity={0.3}
						/>
						<XAxis
							dataKey="label"
							tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis
							tickFormatter={formatCompact}
							tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
							axisLine={false}
							tickLine={false}
							width={55}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Bar
							dataKey="revenue"
							fill="#22c55e"
							radius={[4, 4, 0, 0]}
						/>
					</BarChart>
				) : (
					<LineChart data={data}>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="hsl(var(--border))"
							opacity={0.3}
						/>
						<XAxis
							dataKey="label"
							tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis
							tickFormatter={formatCompact}
							tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
							axisLine={false}
							tickLine={false}
							width={55}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Line
							type="monotone"
							dataKey="revenue"
							stroke="#22c55e"
							strokeWidth={2.5}
							dot={{ r: 3, fill: "#22c55e" }}
						/>
					</LineChart>
				)}
			</ResponsiveContainer>
		</div>
	);
}
