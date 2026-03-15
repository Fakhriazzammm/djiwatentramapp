import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";

const formatCurrency = (v: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
		notation: "compact",
		compactDisplay: "short",
	}).format(v);

const formatFull = (v: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(v);

const EXPENSE_COLORS = [
	"#ef4444", "#f97316", "#eab308", "#84cc16",
	"#06b6d4", "#8b5cf6", "#ec4899", "#14b8a6",
];

const INCOME_COLORS = [
	"#22c55e", "#16a34a", "#15803d", "#3b82f6",
	"#0ea5e9", "#6366f1", "#10b981", "#34d399",
];

// ─── Period Comparison Cards ──────────────────────────────────────────────────

export function PeriodComparisonCards() {
	const comparison = useQuery(api.finance.getPeriodComparison);

	if (!comparison) {
		return (
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				{[1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-24 rounded-xl" />
				))}
			</div>
		);
	}

	const items = [
		{
			label: "Pemasukan",
			curr: comparison.current.income,
			prev: comparison.previous.income,
			pct: comparison.changes.incomePct,
			colorUp: "text-green-600",
			colorDown: "text-red-600",
			bg: "bg-green-500/10",
		},
		{
			label: "Pengeluaran",
			curr: comparison.current.expense,
			prev: comparison.previous.expense,
			pct: comparison.changes.expensePct,
			colorUp: "text-red-600", // spending up is bad
			colorDown: "text-green-600",
			bg: "bg-red-500/10",
		},
		{
			label: "Saldo Bersih",
			curr: comparison.current.net,
			prev: comparison.previous.net,
			pct: comparison.changes.netPct,
			colorUp: "text-primary",
			colorDown: "text-destructive",
			bg: "bg-primary/10",
		},
	];

	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
			{items.map((item) => {
				const isUp = item.pct >= 0;
				// For expense, up is bad; for income/net, up is good
				const isPositive = item.label === "Pengeluaran" ? !isUp : isUp;

				return (
					<div
						key={item.label}
						className="rounded-xl border border-border bg-card p-4"
					>
						<div className="mb-2 flex items-center justify-between">
							<span className="text-muted-foreground text-xs font-medium">
								{item.label}
							</span>
							<span
								className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
									isPositive
										? "bg-green-500/10 text-green-600"
										: "bg-red-500/10 text-red-600"
								}`}
							>
								{isUp ? (
									<TrendingUp className="h-2.5 w-2.5" />
								) : (
									<TrendingDown className="h-2.5 w-2.5" />
								)}
								{Math.abs(item.pct).toFixed(1)}%
							</span>
						</div>
						<p className={`font-bold text-xl ${isPositive ? item.colorUp : item.colorDown}`}>
							{formatFull(item.curr)}
						</p>
						<div className="mt-1 flex items-center gap-1">
							<span className="text-muted-foreground text-[10px]">
								Bulan lalu: {formatFull(item.prev)}
							</span>
						</div>
						<p className="mt-0.5 text-[10px] text-muted-foreground">
							{comparison.current.label} vs {comparison.previous.label}
						</p>
					</div>
				);
			})}
		</div>
	);
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────

export function TrendChart() {
	const [mode, setMode] = useState<"monthly" | "weekly">("monthly");
	const [chartType, setChartType] = useState<"bar" | "line">("bar");

	const monthly = useQuery(api.finance.getMonthlyTrend, { months: 6 });
	const weekly = useQuery(api.finance.getWeeklyTrend, { weeks: 8 });

	const data = mode === "monthly" ? monthly : weekly;

	if (!data) {
		return (
			<div className="h-64 animate-pulse rounded-xl bg-muted/50" />
		);
	}

	const CustomTooltip = ({ active, payload, label }: any) => {
		if (!active || !payload?.length) return null;
		return (
			<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
				<p className="mb-1 font-semibold">{label}</p>
				{payload.map((p: any) => (
					<p key={p.dataKey} style={{ color: p.color }}>
						{p.name}: {formatFull(p.value)}
					</p>
				))}
			</div>
		);
	};

	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-bold text-base">Tren Keuangan</h3>
				<div className="flex gap-1.5">
					{/* Period Toggle */}
					<div className="flex rounded-lg border border-border overflow-hidden text-xs">
						{(["monthly", "weekly"] as const).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => setMode(m)}
								className={`px-3 py-1.5 font-medium transition-colors ${
									mode === m
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-muted"
								}`}
							>
								{m === "monthly" ? "Bulanan" : "Mingguan"}
							</button>
						))}
					</div>
					{/* Chart Type Toggle */}
					<div className="flex rounded-lg border border-border overflow-hidden text-xs">
						{(["bar", "line"] as const).map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => setChartType(t)}
								className={`px-3 py-1.5 font-medium transition-colors ${
									chartType === t
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-muted"
								}`}
							>
								{t === "bar" ? "Bar" : "Line"}
							</button>
						))}
					</div>
				</div>
			</div>

			<ResponsiveContainer width="100%" height={220}>
				{chartType === "bar" ? (
					<BarChart data={data} barGap={4} barCategoryGap="25%">
						<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
						<XAxis
							dataKey="label"
							tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis
							tickFormatter={(v) => formatCurrency(v)}
							tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
							axisLine={false}
							tickLine={false}
							width={55}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Legend
							wrapperStyle={{ fontSize: "11px" }}
							formatter={(value) =>
								value === "income" ? "Pemasukan" : value === "expense" ? "Pengeluaran" : "Net"
							}
						/>
						<Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="income" />
						<Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} name="expense" />
					</BarChart>
				) : (
					<LineChart data={data}>
						<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
						<XAxis
							dataKey="label"
							tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis
							tickFormatter={(v) => formatCurrency(v)}
							tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
							axisLine={false}
							tickLine={false}
							width={55}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Legend
							wrapperStyle={{ fontSize: "11px" }}
							formatter={(value) =>
								value === "income" ? "Pemasukan" : value === "expense" ? "Pengeluaran" : "Net"
							}
						/>
						<Line
							type="monotone"
							dataKey="income"
							stroke="#22c55e"
							strokeWidth={2.5}
							dot={{ r: 3, fill: "#22c55e" }}
							name="income"
						/>
						<Line
							type="monotone"
							dataKey="expense"
							stroke="#ef4444"
							strokeWidth={2.5}
							dot={{ r: 3, fill: "#ef4444" }}
							name="expense"
						/>
						<Line
							type="monotone"
							dataKey="net"
							stroke="#3b82f6"
							strokeWidth={2}
							strokeDasharray="5 5"
							dot={{ r: 2, fill: "#3b82f6" }}
							name="net"
						/>
					</LineChart>
				)}
			</ResponsiveContainer>
		</div>
	);
}

// ─── Expense Category Pie Chart ───────────────────────────────────────────────

export function ExpenseCategoryPieChart() {
	const [view, setView] = useState<"expense" | "income">("expense");
	const breakdown = useQuery(api.finance.getExpenseCategoryBreakdown, {});

	if (!breakdown) {
		return <div className="h-64 animate-pulse rounded-xl bg-muted/50" />;
	}

	const data =
		view === "expense"
			? breakdown.expenseBreakdown
			: breakdown.incomeBreakdown;

	const colors = view === "expense" ? EXPENSE_COLORS : INCOME_COLORS;
	const total = view === "expense" ? breakdown.totalExpense : breakdown.totalIncome;

	const categoryLabels: Record<string, string> = {
		makanan_minuman: "Makan & Minum",
		belanja_stok: "Belanja Stok",
		peralatan_kantor: "Peralatan",
		utilitas_listrik_air: "Utilitas",
		transportasi: "Transportasi",
		gaji_karyawan: "Gaji",
		sewa_tempat: "Sewa",
		pemasaran: "Pemasaran",
		pajak: "Pajak",
		hiburan: "Hiburan",
		lainnya: "Lainnya",
		Penjualan: "Penjualan",
		Rekonsiliasi: "Rekonsiliasi",
	};

	const label = (cat: string) =>
		categoryLabels[cat] ?? cat.replace(/_/g, " ");

	const CustomTooltip = ({ active, payload }: any) => {
		if (!active || !payload?.length) return null;
		const d = payload[0];
		return (
			<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
				<p className="font-semibold">{label(d.name)}</p>
				<p style={{ color: d.payload.fill }}>{formatFull(d.value)}</p>
				<p className="text-muted-foreground">{d.payload.percentage.toFixed(1)}%</p>
			</div>
		);
	};

	const CustomLabel = ({ cx, cy, midAngle, outerRadius, name, percentage }: any) => {
		if (percentage < 8) return null;
		const RADIAN = Math.PI / 180;
		const radius = outerRadius * 0.75;
		const x = cx + radius * Math.cos(-midAngle * RADIAN);
		const y = cy + radius * Math.sin(-midAngle * RADIAN);
		return (
			<text
				x={x}
				y={y}
				fill="white"
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={9}
				fontWeight={600}
			>
				{percentage.toFixed(0)}%
			</text>
		);
	};

	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="font-bold text-base">Breakdown Kategori</h3>
				<div className="flex rounded-lg border border-border overflow-hidden text-xs">
					{(["expense", "income"] as const).map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => setView(v)}
							className={`px-3 py-1.5 font-medium transition-colors ${
								view === v
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-muted"
							}`}
						>
							{v === "expense" ? "Pengeluaran" : "Pemasukan"}
						</button>
					))}
				</div>
			</div>

			{data.length === 0 ? (
				<div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
					Belum ada data {view === "expense" ? "pengeluaran" : "pemasukan"} bulan ini
				</div>
			) : (
				<div className="flex flex-col gap-4 md:flex-row md:items-center">
					<div className="flex-shrink-0">
						<ResponsiveContainer width={180} height={180}>
							<PieChart>
								<Pie
									data={data}
									cx="50%"
									cy="50%"
									outerRadius={85}
									innerRadius={30}
									dataKey="amount"
									nameKey="category"
									labelLine={false}
									label={<CustomLabel />}
								>
									{data.map((_, i) => (
										<Cell key={i} fill={colors[i % colors.length]} />
									))}
								</Pie>
								<Tooltip content={<CustomTooltip />} />
							</PieChart>
						</ResponsiveContainer>
					</div>
					<div className="flex-1 space-y-1.5">
						<p className="mb-2 text-xs font-semibold text-muted-foreground">
							Total: {formatFull(total)}
						</p>
						{data.slice(0, 7).map((item, i) => (
							<div key={item.category} className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-2 min-w-0">
									<div
										className="h-2.5 w-2.5 shrink-0 rounded-full"
										style={{ backgroundColor: colors[i % colors.length] }}
									/>
									<span className="text-xs truncate">{label(item.category)}</span>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<span className="text-xs font-medium">{formatFull(item.amount)}</span>
									<span className="text-[10px] text-muted-foreground w-8 text-right">
										{item.percentage.toFixed(0)}%
									</span>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
