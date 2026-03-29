import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import {
	AlertTriangle,
	ArrowDownRight,
	ArrowUpRight,
	Clock,
	Coffee,
	DollarSign,
	Loader2,
	Package,
	ShoppingCart,
	TrendingUp,
	Users,
	Wallet,
} from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialTargetPanel } from "./finance/-components/financial-target-panel";
import { PeriodComparisonCards, TrendChart } from "./finance/-components/finance-charts";

import { formatCurrencyIDR } from "@/lib/export-utils";

export const Route = createLazyFileRoute("/admin/")({
	component: DashboardAdmin,
});

function DashboardAdmin() {
	const stats = useQuery(api.dashboard.getDashboardStats);
	const shiftStatus = useQuery(api.finance.getShiftStatus);
	const todayOrders = useQuery(api.orders.getOrders, {});

	if (stats === undefined) {
		return (
			<div className="space-y-4 md:space-y-6">
				{/* Stats Cards Skeleton */}
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
							<div className="flex items-center justify-between mb-3">
								<Skeleton className="h-5 w-5 rounded-md" />
								<Skeleton className="h-4 w-12 rounded-full" />
							</div>
							<Skeleton className="h-4 w-24 mb-2" />
							<Skeleton className="h-7 w-32" />
						</div>
					))}
				</div>

				{/* Financial Target + Period Comparison Skeleton */}
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<Skeleton className="h-[200px] w-full rounded-2xl" />
					<div className="space-y-3">
						<Skeleton className="h-6 w-48" />
						<div className="grid grid-cols-2 gap-3">
							<Skeleton className="h-[120px] w-full rounded-2xl" />
							<Skeleton className="h-[120px] w-full rounded-2xl" />
						</div>
					</div>
				</div>

				{/* Trend Chart Skeleton */}
				<Skeleton className="h-[300px] w-full rounded-2xl" />

				{/* Charts Row Skeleton */}
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<Skeleton className="h-[250px] w-full rounded-2xl" />
					<Skeleton className="h-[250px] w-full rounded-2xl" />
				</div>
			</div>
		);
	}

	const maxRevenue = Math.max(...stats.revenueLast7Days.map((d: any) => d.revenue), 1);

	return (
		<div className="space-y-4 md:space-y-6">
			{/* Stats Cards */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
				<StatCard
					icon={<ShoppingCart className="h-5 w-5" />}
					label="Pesanan Hari Ini"
					value={stats.todayOrders.toString()}
					subLabel={`${stats.pendingOrders} menunggu`}
					color="primary"
				/>
				<StatCard
					icon={<DollarSign className="h-5 w-5" />}
					label="Pendapatan Hari Ini"
					value={`Rp ${stats.todayRevenue.toLocaleString("id-ID")}`}
					color="green"
				/>
				<StatCard
					icon={<Coffee className="h-5 w-5" />}
					label="Produk Aktif"
					value={stats.activeProducts.toString()}
					subLabel={`${stats.totalProducts} total`}
					color="accent"
				/>
				<StatCard
					icon={<Wallet className="h-5 w-5" />}
					label="Saldo Kas"
					value={`Rp ${stats.netBalance.toLocaleString("id-ID")}`}
					trend={stats.netBalance >= 0 ? "up" : "down"}
					color={stats.netBalance >= 0 ? "green" : "red"}
				/>
			</div>

			{/* Shift Information (Added for shift-level visibility) */}
			{shiftStatus?.allShifts && shiftStatus.allShifts.length > 0 && (
				<motion.div
					className="rounded-2xl border border-border bg-card p-4 shadow-sm"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
				>
					<h3 className="mb-3 font-bold text-base">Status Shift Hari Ini</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						{shiftStatus.allShifts.map((shift: any, i: number) => {
							const isActive = !shift.endTime;
							const sEnd = shift.endTime || Date.now();
							
							// Calculate Shift Cash & QRIS
							let sCash = 0;
							let sQris = 0;
							let sRevenue = 0;
							
							if (todayOrders) {
								todayOrders.forEach((o: any) => {
									if ((o.status === "completed" || o.status === "paid") && o.createdAt >= shift.startTime && o.createdAt <= sEnd) {
										sRevenue += o.totalAmount;
										if (o.paymentMethod === 'cash') sCash += o.totalAmount;
										if (o.paymentMethod === 'qris' || o.paymentMethod === 'transfer') sQris += o.totalAmount;
									}
								});
							}

							return (
								<div key={i} className={`p-3 rounded-xl border ${isActive ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-muted/30'}`}>
									<div className="flex justify-between items-start mb-2">
										<div>
											<p className="font-bold text-sm">{shift.shiftName || `Shift ${i + 1}`}</p>
											<p className="text-xs text-muted-foreground">Kasir: {shift.cashierName || 'Unknown'}</p>
										</div>
										<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
											{isActive ? 'AKTIF' : 'SELESAI'}
										</span>
									</div>
									<div className="space-y-1 text-xs mt-2 pt-2 border-t border-border/50">
										<div className="flex justify-between">
											<span className="text-muted-foreground">Cash/Kasir:</span>
											<span className="font-medium">{formatCurrencyIDR(sCash)}</span>
										</div>
										<div className="flex justify-between">
											<span className="text-muted-foreground">Debit/QRIS:</span>
											<span className="font-medium">{formatCurrencyIDR(sQris)}</span>
										</div>
										<div className="flex justify-between pt-1 mt-1 border-t border-dashed border-border/50">
											<span className="text-muted-foreground font-semibold">Total Revenue:</span>
											<span className="font-bold text-primary">{formatCurrencyIDR(sRevenue)}</span>
										</div>
										<div className="flex justify-between pt-1 mt-1 border-t border-border/50">
											<span className="text-muted-foreground">Modal Awal:</span>
											<span className="font-medium">{formatCurrencyIDR(shift.modalAwal || 0)}</span>
										</div>
										{shift.setoranAkhir !== undefined && (
											<div className="flex justify-between">
												<span className="text-muted-foreground">Fisik Laci:</span>
												<span className="font-medium text-emerald-600">{formatCurrencyIDR(shift.setoranAkhir)}</span>
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</motion.div>
			)}

			{/* Financial Target + Period Comparison */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<FinancialTargetPanel compact />
				<div className="space-y-3">
					<h3 className="font-bold text-base md:text-lg">Perbandingan Bulan Ini vs Lalu</h3>
					<PeriodComparisonCards />
				</div>
			</div>

			{/* Trend Chart */}
			<TrendChart />

			{/* Charts Row */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{/* Revenue Chart */}
				<motion.div
					className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1 }}
				>
					<div className="mb-4 flex items-center justify-between">
						<h3 className="font-bold text-base md:text-lg">Pendapatan 7 Hari Terakhir</h3>
						<div className="flex items-center gap-1 text-green-500 text-xs">
							<TrendingUp className="h-3.5 w-3.5" />
							<span>Rp {stats.totalIncome.toLocaleString("id-ID")}</span>
						</div>
					</div>
					<div className="flex items-end justify-between gap-2 h-40">
						{stats.revenueLast7Days.map((day: any, i: number) => (
							<div key={i} className="flex flex-1 flex-col items-center gap-2">
								<div className="relative w-full flex-1 flex items-end">
									<div
										className="w-full rounded-t-md bg-gradient-to-t from-primary/80 to-primary transition-all duration-500"
										style={{
											height: `${Math.max((day.revenue / maxRevenue) * 100, 4)}%`,
										}}
									>
										{day.revenue > 0 && (
											<div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-medium text-muted-foreground whitespace-nowrap">
												{(day.revenue / 1000).toFixed(0)}k
											</div>
										)}
									</div>
								</div>
								<span className="text-[10px] text-muted-foreground">{day.date}</span>
							</div>
						))}
					</div>
				</motion.div>

				{/* Order Status Breakdown */}
				<motion.div
					className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.2 }}
				>
					<h3 className="mb-4 font-bold text-base md:text-lg">Status Pesanan</h3>
					<div className="space-y-3">
						<StatusRow
							label="Menunggu"
							count={stats.orderStatusBreakdown.pending}
							color="yellow"
							icon={<Clock className="h-4 w-4" />}
						/>
						<StatusRow
							label="Dibayar"
							count={stats.orderStatusBreakdown.paid}
							color="blue"
							icon={<Wallet className="h-4 w-4" />}
						/>
						<StatusRow
							label="Selesai"
							count={stats.orderStatusBreakdown.completed}
							color="green"
							icon={<TrendingUp className="h-4 w-4" />}
						/>
						<StatusRow
							label="Dibatalkan"
							count={stats.orderStatusBreakdown.cancelled}
							color="red"
							icon={<ArrowDownRight className="h-4 w-4" />}
						/>
					</div>
					<div className="mt-4 pt-4 border-t border-border">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Total Pesanan</span>
							<span className="font-semibold">
								{stats.orderStatusBreakdown.pending +
									stats.orderStatusBreakdown.paid +
									stats.orderStatusBreakdown.completed +
									stats.orderStatusBreakdown.cancelled}
							</span>
						</div>
					</div>
				</motion.div>
			</div>

			{/* Bottom Row */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				{/* Low Stock Alert */}
				<motion.div
					className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3 }}
				>
					<div className="mb-4 flex items-center justify-between">
						<h3 className="font-bold text-base md:text-lg">Stok Rendah</h3>
						{stats.lowStockCount > 0 && (
							<span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
								{stats.lowStockCount} item
							</span>
						)}
					</div>
					{stats.lowStockItems.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-6 text-center">
							<Package className="h-10 w-10 text-muted-foreground/50" />
							<p className="mt-2 text-muted-foreground text-sm">Semua stok aman</p>
						</div>
					) : (
						<div className="space-y-2">
							{stats.lowStockItems.map((item: any) => (
								<div
									key={item._id}
									className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-2.5"
								>
									<div className="flex items-center gap-2">
										<AlertTriangle className="h-4 w-4 text-destructive" />
										<span className="text-sm font-medium">{item.ingredientName}</span>
									</div>
									<span className="text-xs text-destructive">
										{item.quantity} / {item.lowStockThreshold} {item.unit}
									</span>
								</div>
							))}
						</div>
					)}
				</motion.div>

				{/* Top Products */}
				<motion.div
					className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4 }}
				>
					<h3 className="mb-4 font-bold text-base md:text-lg">Produk Terlaris</h3>
					{stats.topProducts.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-6 text-center">
							<Coffee className="h-10 w-10 text-muted-foreground/50" />
							<p className="mt-2 text-muted-foreground text-sm">Belum ada penjualan</p>
						</div>
					) : (
						<div className="space-y-2">
							{stats.topProducts.map((product: any, i: number) => (
								<div
									key={product.name}
									className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5"
								>
									<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
										{i + 1}
									</span>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium truncate">{product.name}</p>
										<p className="text-[10px] text-muted-foreground">
											{product.count} terjual
										</p>
									</div>
									<span className="text-xs font-medium text-primary">
										Rp {(product.revenue / 1000).toFixed(0)}k
									</span>
								</div>
							))}
						</div>
					)}
				</motion.div>

				{/* Recent Orders */}
				<motion.div
					className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.5 }}
				>
					<h3 className="mb-4 font-bold text-base md:text-lg">Pesanan Terbaru</h3>
					{stats.recentOrders.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-6 text-center">
							<ShoppingCart className="h-10 w-10 text-muted-foreground/50" />
							<p className="mt-2 text-muted-foreground text-sm">Belum ada pesanan</p>
						</div>
					) : (
						<div className="space-y-2">
							{stats.recentOrders.slice(0, 5).map((order: any) => (
								<div
									key={order._id}
									className="flex items-center justify-between rounded-lg bg-muted/50 p-2.5"
								>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium">#{order.orderNumber}</p>
										<p className="text-[10px] text-muted-foreground">
											{new Date(order.createdAt).toLocaleTimeString("id-ID", {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</p>
									</div>
									<div className="text-right">
										<p className="text-sm font-medium">
											Rp {order.totalAmount.toLocaleString("id-ID")}
										</p>
										<span
											className={`text-[10px] font-medium ${
												order.status === "completed"
													? "text-green-500"
													: order.status === "paid"
														? "text-blue-500"
														: order.status === "pending"
															? "text-yellow-500"
															: "text-red-500"
											}`}
										>
											{order.status === "completed"
												? "Selesai"
												: order.status === "paid"
													? "Dibayar"
													: order.status === "pending"
														? "Menunggu"
														: "Batal"}
										</span>
									</div>
								</div>
							))}
						</div>
					)}
				</motion.div>
			</div>

			{/* Financial Summary */}
			<motion.div
				className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6"
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.6 }}
			>
				<h3 className="mb-4 font-bold text-base md:text-lg">Ringkasan Keuangan</h3>
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					<div className="rounded-xl bg-green-500/10 p-4">
						<div className="flex items-center gap-2 text-green-500">
							<ArrowUpRight className="h-4 w-4" />
							<span className="text-xs font-medium">Pemasukan Hari Ini</span>
						</div>
						<p className="mt-2 font-bold text-lg text-green-600">
							Rp {stats.todayIncome.toLocaleString("id-ID")}
						</p>
						<p className="text-[10px] text-muted-foreground mt-1">
							Total: Rp {stats.totalIncome.toLocaleString("id-ID")}
						</p>
					</div>
					<div className="rounded-xl bg-red-500/10 p-4">
						<div className="flex items-center gap-2 text-red-500">
							<ArrowDownRight className="h-4 w-4" />
							<span className="text-xs font-medium">Pengeluaran Hari Ini</span>
						</div>
						<p className="mt-2 font-bold text-lg text-red-600">
							Rp {stats.todayExpense.toLocaleString("id-ID")}
						</p>
						<p className="text-[10px] text-muted-foreground mt-1">
							Total: Rp {stats.totalExpense.toLocaleString("id-ID")}
						</p>
					</div>
					<div className="rounded-xl bg-primary/10 p-4">
						<div className="flex items-center gap-2 text-primary">
							<Wallet className="h-4 w-4" />
							<span className="text-xs font-medium">Saldo Bersih (Total)</span>
						</div>
						<p className={`mt-2 font-bold text-lg ${stats.netBalance >= 0 ? "text-primary" : "text-red-500"}`}>
							Rp {stats.netBalance.toLocaleString("id-ID")}
						</p>
						<p className="text-[10px] text-muted-foreground mt-1">
							Hari Ini: Rp {(stats.todayIncome - stats.todayExpense).toLocaleString("id-ID")}
						</p>
					</div>
					<div className="rounded-xl bg-accent/10 p-4">
						<div className="flex items-center gap-2 text-accent">
							<Users className="h-4 w-4" />
							<span className="text-xs font-medium">Rata-rata/Pesanan</span>
						</div>
						<p className="mt-2 font-bold text-lg text-accent">
							Rp {stats.todayOrders > 0
								? Math.round(stats.todayRevenue / stats.todayOrders).toLocaleString("id-ID")
								: "0"}
						</p>
					</div>
				</div>
				{/* Quick Links */}
				<div className="mt-4 border-t border-border pt-4 flex flex-wrap gap-2">
					<a
						href="/admin/finance/reports"
						className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary hover:border-primary/30"
					>
						<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
						Laporan Keuangan (PDF/Excel)
					</a>
					<a
						href="/admin/finance"
						className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
					>
						<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
						Catat Transaksi
					</a>
				</div>
			</motion.div>
		</div>
	);
}

// Stat Card Component
function StatCard({
	icon,
	label,
	value,
	subLabel,
	trend,
	color,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	subLabel?: string;
	trend?: "up" | "down";
	color: "primary" | "green" | "red" | "accent";
}) {
	const colorClasses = {
		primary: "bg-primary/10 text-primary",
		green: "bg-green-500/10 text-green-500",
		red: "bg-red-500/10 text-red-500",
		accent: "bg-accent/10 text-accent",
	};

	return (
		<motion.div
			className="rounded-xl border border-border bg-card p-4 shadow-sm"
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.3 }}
		>
			<div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<span className={colorClasses[color]}>{icon}</span>
			</div>
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="mt-1 font-bold text-lg">{value}</p>
			{subLabel && (
				<p className="text-muted-foreground text-[10px]">{subLabel}</p>
			)}
			{trend && (
				<div className={`flex items-center gap-1 mt-1 text-xs ${trend === "up" ? "text-green-500" : "text-red-500"}`}>
					{trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
					<span>{trend === "up" ? "Positif" : "Negatif"}</span>
				</div>
			)}
		</motion.div>
	);
}

// Status Row Component
function StatusRow({
	label,
	count,
	color,
	icon,
}: {
	label: string;
	count: number;
	color: "yellow" | "blue" | "green" | "red";
	icon: React.ReactNode;
}) {
	const colorClasses = {
		yellow: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
		blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
		green: "bg-green-500/10 text-green-500 border-green-500/20",
		red: "bg-red-500/10 text-red-500 border-red-500/20",
	};

	const total = 100;
	const percentage = Math.min((count / (total || 1)) * 100, 100);

	return (
		<div className="flex items-center gap-3">
			<div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorClasses[color]}`}>
				{icon}
			</div>
			<div className="flex-1">
				<div className="flex items-center justify-between mb-1">
					<span className="text-sm">{label}</span>
					<span className="text-sm font-semibold">{count}</span>
				</div>
				<div className="h-1.5 rounded-full bg-muted overflow-hidden">
					<div
						className={`h-full rounded-full transition-all duration-500 ${
							color === "yellow"
								? "bg-yellow-500"
								: color === "blue"
									? "bg-blue-500"
									: color === "green"
										? "bg-green-500"
										: "bg-red-500"
						}`}
						style={{ width: `${Math.min(percentage, 100)}%` }}
					/>
				</div>
			</div>
		</div>
	);
}
