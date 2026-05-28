import React from "react";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	LineChart,
	Line,
	AreaChart,
	Area,
	PieChart,
	Pie,
	Cell,
	Legend,
} from "recharts";
import type { ChartData } from "./types";
import { toRupiah } from "./utils";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface ChartBubbleProps {
	chart: ChartData;
}

export const ChartBubble = ({ chart }: ChartBubbleProps) => {
	const renderChart = () => {
		const { type, data, xAxisKey, series } = chart;

		switch (type) {
			case "bar":
				return (
					<BarChart data={data}>
						<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
						<XAxis dataKey={xAxisKey} fontSize={10} tickLine={false} axisLine={false} />
						<YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => toRupiah(v)} />
						<Tooltip
							contentStyle={{ backgroundColor: "white", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
							formatter={(v: any) => [toRupiah(v), ""]}
						/>
						{series.map((s, i) => (
							<Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color || COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
						))}
					</BarChart>
				);
			case "line":
				return (
					<LineChart data={data}>
						<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
						<XAxis dataKey={xAxisKey} fontSize={10} tickLine={false} axisLine={false} />
						<YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => toRupiah(v)} />
						<Tooltip
							contentStyle={{ backgroundColor: "white", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
							formatter={(v: any) => [toRupiah(v), ""]}
						/>
						{series.map((s, i) => (
							<Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
						))}
					</LineChart>
				);
			case "area":
				return (
					<AreaChart data={data}>
						<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
						<XAxis dataKey={xAxisKey} fontSize={10} tickLine={false} axisLine={false} />
						<YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => toRupiah(v)} />
						<Tooltip
							contentStyle={{ backgroundColor: "white", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
							formatter={(v: any) => [toRupiah(v), ""]}
						/>
						{series.map((s, i) => (
							<Area key={s.key} type="monotone" dataKey={s.key} name={s.name} fill={s.color || COLORS[i % COLORS.length]} stroke={s.color || COLORS[i % COLORS.length]} fillOpacity={0.1} />
						))}
					</AreaChart>
				);
			case "pie":
				return (
					<PieChart>
						<Pie data={data} dataKey={series[0].key} nameKey={xAxisKey} cx="50%" cy="50%" outerRadius={80} paddingAngle={5}>
							{data.map((_, index) => (
								<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
							))}
						</Pie>
						<Tooltip
							contentStyle={{ backgroundColor: "white", borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }}
							formatter={(v: any) => [toRupiah(v), ""]}
						/>
						<Legend verticalAlign="bottom" height={36} />
					</PieChart>
				);
			default:
				return null;
		}
	};

	return (
		<div className="mt-4 w-full rounded-2xl border border-border/50 bg-muted/20 p-4 shadow-inner animate-in fade-in zoom-in duration-500">
			<div className="mb-4">
				<h4 className="text-sm font-bold text-foreground">{chart.title}</h4>
				{chart.description && <p className="text-[10px] text-muted-foreground">{chart.description}</p>}
			</div>
			<div className="h-64 w-full">
				<ResponsiveContainer width="100%" height="100%">
					{renderChart() || <div />}
				</ResponsiveContainer>
			</div>
		</div>
	);
};
