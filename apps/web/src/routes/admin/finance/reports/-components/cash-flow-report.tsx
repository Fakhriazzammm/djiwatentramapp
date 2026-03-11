import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from "recharts";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import type { DateRange } from "./period-selector";
import { formatCurrencyIDR } from "@/lib/export-utils";

interface Props {
	range: DateRange;
}

export function CashFlowReport({ range }: Props) {
	const data = useQuery(api.finance.getCashFlowReport, {
		startDate: range.startDate,
		endDate: range.endDate,
	});

	if (!data) {
		return (
			<div className="flex items-center justify-center py-20 text-muted-foreground">
				Memuat data...
			</div>
		);
	}

	const isPositive = data.netCashFlow >= 0;
	type DailyCashFlow = { date: string; inflow: number; outflow: number; net: number; balance: number };
	type PaymentMethodData = { inflow: number; outflow: number };
	const dailyCashFlow = data.dailyCashFlow as DailyCashFlow[];
	const byPaymentMethod = data.byPaymentMethod as Record<string, PaymentMethodData>;
	const chartData = dailyCashFlow.map((d) => ({
		date: format(new Date(d.date), "d MMM", { locale: id }),
		Pemasukan: d.inflow,
		Pengeluaran: d.outflow,
		Saldo: d.balance,
	}));

	return (
		<div className="space-y-6">
			{/* Summary Cards */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div className="rounded-xl border border-border bg-card p-5">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs text-muted-foreground">Total Pemasukan</p>
							<p className="font-bold text-xl text-green-600 mt-1">{formatCurrencyIDR(data.totalInflow)}</p>
						</div>
						<div className="rounded-full bg-green-100 dark:bg-green-950/30 p-3 text-green-600">
							<ArrowDownLeft className="h-5 w-5" />
						</div>
					</div>
				</div>
				<div className="rounded-xl border border-border bg-card p-5">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs text-muted-foreground">Total Pengeluaran</p>
							<p className="font-bold text-xl text-red-600 mt-1">{formatCurrencyIDR(data.totalOutflow)}</p>
						</div>
						<div className="rounded-full bg-red-100 dark:bg-red-950/30 p-3 text-red-600">
							<ArrowUpRight className="h-5 w-5" />
						</div>
					</div>
				</div>
				<div className="rounded-xl border border-border bg-card p-5">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs text-muted-foreground">Arus Kas Bersih</p>
							<p className={`font-bold text-xl mt-1 ${isPositive ? "text-blue-600" : "text-red-600"}`}>
								{formatCurrencyIDR(data.netCashFlow)}
							</p>
						</div>
						<div className={`rounded-full p-3 ${isPositive ? "bg-blue-100 dark:bg-blue-950/30 text-blue-600" : "bg-red-100 dark:bg-red-950/30 text-red-600"}`}>
							<Wallet className="h-5 w-5" />
						</div>
					</div>
				</div>
			</div>

			{/* Area Chart */}
			{chartData.length > 0 && (
				<div className="rounded-xl border border-border bg-card p-6">
					<h3 className="font-bold text-base mb-4">Tren Arus Kas</h3>
					<ResponsiveContainer width="100%" height={240}>
						<AreaChart data={chartData}>
							<defs>
								<linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
									<stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
								</linearGradient>
								<linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
									<stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
								</linearGradient>
							</defs>
							<XAxis dataKey="date" tick={{ fontSize: 10 }} />
							<YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}jt`} tick={{ fontSize: 10 }} />
							<Tooltip formatter={(v) => formatCurrencyIDR(Number(v))} />
							<Legend />
							<Area type="monotone" dataKey="Pemasukan" stroke="#22c55e" fill="url(#colorInflow)" strokeWidth={2} />
							<Area type="monotone" dataKey="Pengeluaran" stroke="#ef4444" fill="url(#colorOutflow)" strokeWidth={2} />
						</AreaChart>
					</ResponsiveContainer>
				</div>
			)}

			{/* Payment Method Breakdown */}
			{Object.keys(byPaymentMethod).length > 0 && (
				<div className="rounded-xl border border-border bg-card overflow-hidden">
					<div className="px-6 py-3 border-b border-border font-bold text-sm bg-muted/30">
						Berdasarkan Metode Pembayaran
					</div>
					<table className="w-full text-sm">
						<thead className="bg-muted/20 text-xs text-muted-foreground uppercase">
							<tr>
								<th className="px-6 py-3 text-left">Metode</th>
								<th className="px-6 py-3 text-right">Pemasukan</th>
								<th className="px-6 py-3 text-right">Pengeluaran</th>
								<th className="px-6 py-3 text-right">Net</th>
							</tr>
						</thead>
						<tbody>
							{Object.entries(byPaymentMethod).map(([method, val]) => {
								const net = val.inflow - val.outflow;
								return (
									<tr key={method} className="border-b border-border/40 hover:bg-muted/20">
										<td className="px-6 py-3 font-medium">{method}</td>
										<td className="px-6 py-3 text-right text-green-600">{formatCurrencyIDR(val.inflow)}</td>
										<td className="px-6 py-3 text-right text-red-600">{formatCurrencyIDR(val.outflow)}</td>
										<td className={`px-6 py-3 text-right font-bold ${net >= 0 ? "text-blue-600" : "text-red-600"}`}>
											{formatCurrencyIDR(net)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* Daily Cash Flow Table */}
			{data.dailyCashFlow.length > 0 && (
				<div className="rounded-xl border border-border bg-card overflow-hidden">
					<div className="px-6 py-3 border-b border-border font-bold text-sm bg-muted/30">
						Arus Kas Harian
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="bg-muted/20 text-xs text-muted-foreground uppercase">
								<tr>
									<th className="px-6 py-3 text-left">Tanggal</th>
									<th className="px-6 py-3 text-right">Pemasukan</th>
									<th className="px-6 py-3 text-right">Pengeluaran</th>
									<th className="px-6 py-3 text-right">Net</th>
									<th className="px-6 py-3 text-right">Saldo Kumulatif</th>
								</tr>
							</thead>
							<tbody>
								{dailyCashFlow.map((d) => (
									<tr key={d.date} className="border-b border-border/40 hover:bg-muted/20">
										<td className="px-6 py-3 font-medium">
											{new Date(d.date).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
										</td>
										<td className="px-6 py-3 text-right text-green-600">{formatCurrencyIDR(d.inflow)}</td>
										<td className="px-6 py-3 text-right text-red-600">{formatCurrencyIDR(d.outflow)}</td>
										<td className={`px-6 py-3 text-right font-medium ${d.net >= 0 ? "text-green-600" : "text-red-600"}`}>
											{d.net >= 0 ? "+" : ""}{formatCurrencyIDR(d.net)}
										</td>
										<td className={`px-6 py-3 text-right font-bold ${d.balance >= 0 ? "text-blue-600" : "text-red-600"}`}>
											{formatCurrencyIDR(d.balance)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{dailyCashFlow.length === 0 && data.totalInflow === 0 && data.totalOutflow === 0 && (
				<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
					<Wallet className="h-10 w-10 mb-3 opacity-30" />
					<p>Tidak ada transaksi pada periode ini</p>
				</div>
			)}
		</div>
	);
}
