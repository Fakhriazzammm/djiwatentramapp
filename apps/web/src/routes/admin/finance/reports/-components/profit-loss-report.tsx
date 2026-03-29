import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Cell,
} from "recharts";
import type { DateRange } from "./period-selector";
import { formatCurrencyIDR } from "@/lib/export-utils";

interface Props {
	range: DateRange;
}

export function ProfitLossReport({ range }: Props) {
	const data = useQuery(api.finance.getProfitLossReport, {
		startDate: range.startDate,
		endDate: range.endDate,
	});

	if (!data) {
		return (
			<div className="space-y-6">
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-6 w-32" />
						</div>
					))}
				</div>
				<Skeleton className="h-64 w-full rounded-xl" />
				<Skeleton className="h-96 w-full rounded-xl" />
			</div>
		);
	}

	const isProfit = data.netProfit >= 0;
	const hppAmount = (data.expense as any).hppAmount || 0;

	// Chart data: income vs expense categories
	const chartData = [
		{ name: "Pendapatan", value: data.income.total, fill: "#22c55e" },
		...(hppAmount > 0 ? [{ name: "HPP/COGS", value: hppAmount, fill: "#f97316" }] : []),
		{ name: "Beban", value: data.expense.total - hppAmount, fill: "#ef4444" },
		{ name: "Laba Bersih", value: Math.max(0, data.netProfit), fill: isProfit ? "#3b82f6" : "#94a3b8" },
	];

	return (
		<div className="space-y-6">
			{/* Summary Cards */}
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<SummaryCard
					label="Total Pendapatan"
					value={data.income.total}
					color="green"
					icon={<TrendingUp className="h-5 w-5" />}
				/>
				{hppAmount > 0 && (
					<SummaryCard
						label="HPP / COGS"
						value={hppAmount}
						color="orange"
						icon={<TrendingDown className="h-5 w-5" />}
					/>
				)}
				<SummaryCard
					label="Total Beban"
					value={data.expense.total - hppAmount}
					color="red"
					icon={<TrendingDown className="h-5 w-5" />}
				/>
				<SummaryCard
					label="Laba Bersih"
					value={data.netProfit}
					color={isProfit ? "blue" : "red"}
					sub={`Margin: ${data.netMargin.toFixed(1)}%`}
					icon={isProfit ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
				/>
			</div>

			{/* Bar Chart */}
			<div className="rounded-xl border border-border bg-card p-6">
				<h3 className="mb-4 font-bold text-base">Ringkasan Visual</h3>
				<ResponsiveContainer width="100%" height={200}>
					<BarChart data={chartData} barSize={48}>
						<XAxis dataKey="name" tick={{ fontSize: 11 }} />
						<YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}jt`} tick={{ fontSize: 10 }} />
						<Tooltip formatter={(v) => formatCurrencyIDR(Number(v))} />
						<Bar dataKey="value" radius={[4, 4, 0, 0]}>
							{chartData.map((entry, i) => (
								<Cell key={i} fill={entry.fill} />
							))}
						</Bar>
					</BarChart>
				</ResponsiveContainer>
			</div>

			{/* Detail Table */}
			<div className="rounded-xl border border-border bg-card overflow-hidden">
				<div className="bg-muted/30 px-6 py-3 font-bold text-sm border-b border-border">
					LAPORAN LABA RUGI
				</div>

				{/* Pendapatan */}
				<Section title="PENDAPATAN" color="green">
					{data.income.salesRevenue > 0 && (
						<Row label="Penjualan (Dari Pesanan)" value={data.income.salesRevenue} />
					)}
					{data.income.sources && data.income.sources.map((s: { category: string; amount: number }) => (
						s.category !== "Penjualan" && (
							<Row key={s.category} label={s.category.replace(/_/g, " ")} value={s.amount} indent />
						)
					))}
					<TotalRow label="TOTAL PENDAPATAN" value={data.income.total} color="green" />
				</Section>

				{/* HPP */}
				{hppAmount > 0 && (
					<Section title="HARGA POKOK PENJUALAN (HPP)" color="orange">
						<Row label="Total HPP dari pesanan" value={hppAmount} />
						<TotalRow label="LABA KOTOR" value={data.grossProfit} color="orange" />
						<div className="flex justify-between items-center px-6 py-1.5 text-xs text-muted-foreground">
							<span className="pl-4">Gross Margin</span>
							<span className="font-medium">{(data.income.salesRevenue > 0 ? (data.grossProfit / data.income.salesRevenue) * 100 : 0).toFixed(1)}%</span>
						</div>
					</Section>
				)}

				{/* Beban Operasional */}
				{data.expense.operatingExpenses.length > 0 && (
					<Section title="BEBAN OPERASIONAL" color="red">
						{data.expense.operatingExpenses.map((e: { category: string; amount: number }) => (
							<Row key={e.category} label={e.category.replace(/_/g, " ")} value={e.amount} indent />
						))}
						<TotalRow label="TOTAL BEBAN" value={data.expense.total - hppAmount} color="red" />
					</Section>
				)}

				{/* Laba Bersih */}
				<div className={`px-6 py-4 border-t-2 border-border ${isProfit ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
					<div className="flex justify-between items-center">
						<span className="font-bold text-base">LABA BERSIH</span>
						<span className={`font-bold text-xl ${isProfit ? "text-green-600" : "text-red-600"}`}>
							{formatCurrencyIDR(data.netProfit)}
						</span>
					</div>
					<div className="flex justify-between items-center mt-1">
						<span className="text-sm text-muted-foreground">Margin Bersih</span>
						<span className="text-sm font-medium">{data.netMargin.toFixed(1)}%</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function SummaryCard({
	label,
	value,
	color,
	sub,
	icon,
}: {
	label: string;
	value: number;
	color: "green" | "red" | "blue" | "orange";
	sub?: string;
	icon: React.ReactNode;
}) {
	const colors = {
		green: "text-green-600 bg-green-50 dark:bg-green-950/20",
		red: "text-red-600 bg-red-50 dark:bg-red-950/20",
		blue: "text-blue-600 bg-blue-50 dark:bg-blue-950/20",
		orange: "text-orange-600 bg-orange-50 dark:bg-orange-950/20",
	};
	return (
		<div className="rounded-xl border border-border bg-card p-4">
			<div className="flex items-center justify-between mb-2">
				<p className="text-xs text-muted-foreground">{label}</p>
				<div className={`rounded-full p-1.5 ${colors[color]}`}>{icon}</div>
			</div>
			<p className={`font-bold text-lg ${colors[color].split(" ")[0]}`}>
				{formatCurrencyIDR(value)}
			</p>
			{sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
		</div>
	);
}

function Section({ title, color, children }: { title: string; color: "green" | "red" | "orange"; children: React.ReactNode }) {
	const headerColors = {
		green: "bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-300",
		red: "bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300",
		orange: "bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-300",
	};
	return (
		<div className="border-b border-border">
			<div className={`px-6 py-2 text-xs font-bold uppercase tracking-wider ${headerColors[color]}`}>
				{title}
			</div>
			{children}
		</div>
	);
}

function Row({ label, value, indent }: { label: string; value: number; indent?: boolean }) {
	return (
		<div className={`flex justify-between items-center px-6 py-2 text-sm hover:bg-muted/30 ${indent ? "pl-10" : ""}`}>
			<span className="text-muted-foreground capitalize">{label}</span>
			<span className="font-medium">{formatCurrencyIDR(value)}</span>
		</div>
	);
}

function TotalRow({ label, value, color }: { label: string; value: number; color: "green" | "red" | "orange" }) {
	const textColors = { green: "text-green-600", red: "text-red-600", orange: "text-orange-600" };
	return (
		<div className="flex justify-between items-center px-6 py-2.5 bg-muted/20 border-t border-border/50">
			<span className="font-semibold text-sm">{label}</span>
			<span className={`font-bold text-base ${textColors[color]}`}>{formatCurrencyIDR(value)}</span>
		</div>
	);
}
