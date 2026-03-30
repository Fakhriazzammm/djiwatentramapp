import { createLazyFileRoute, Link } from "@tanstack/react-router";
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
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialTargetPanel } from "./finance/-components/financial-target-panel";
import { PeriodComparisonCards, TrendChart } from "./finance/-components/finance-charts";
import { useMemo, useState } from "react";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { useMutation } from "convex/react";
import { ShiftDetailModal } from "./-components/ShiftDetailModal";

export const Route = createLazyFileRoute("/admin/")({
	component: DashboardAdmin,
});

function DashboardAdmin() {
	const stats = useQuery(api.dashboard.getDashboardStats);
	const shiftStatus = useQuery(api.finance.getShiftStatus);
	const [selectedShift, setSelectedShift] = useState<any>(null);
	const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);

	if (stats === undefined || shiftStatus === undefined) {
		return (
			<div className="space-y-4 md:space-y-6 animate-pulse">
				{/* Stats Cards Skeleton */}
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
							<div className="flex items-center justify-between mb-4">
								<Skeleton className="h-10 w-10 rounded-xl" />
								<Skeleton className="h-4 w-12 rounded-full" />
							</div>
							<Skeleton className="h-4 w-24 mb-2" />
							<Skeleton className="h-8 w-32" />
						</div>
					))}
				</div>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					<Skeleton className="h-[240px] w-full rounded-3xl" />
					<div className="space-y-4">
						<Skeleton className="h-6 w-48" />
						<div className="grid grid-cols-2 gap-4">
							<Skeleton className="h-[140px] w-full rounded-3xl" />
							<Skeleton className="h-[140px] w-full rounded-3xl" />
						</div>
					</div>
				</div>

				<Skeleton className="h-[350px] w-full rounded-3xl" />

				<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
					<Skeleton className="h-[300px] w-full rounded-3xl" />
					<Skeleton className="h-[300px] w-full rounded-3xl" />
					<Skeleton className="h-[300px] w-full rounded-3xl" />
				</div>
			</div>
		);
	}

	const maxRevenue = Math.max(...stats.revenueLast7Days.map((d: any) => d.revenue), 1);
	const sevenDayRevenue = stats.revenueLast7Days.reduce((sum: number, day: any) => sum + day.revenue, 0);

	return (
		<div className="space-y-6 md:space-y-8 pb-10">
			{/* Stats Cards */}
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<StatCard
					icon={<ShoppingCart className="w-5 h-5" />}
					label="Pesanan Hari Ini"
					value={stats.todayOrders.toString()}
					subLabel={`${stats.pendingOrders} menunggu`}
					color="primary"
				/>
				<StatCard
					icon={<DollarSign className="w-5 h-5" />}
					label="Pendapatan Hari Ini"
					value={formatCurrencyIDR(stats.todayRevenue)}
					subLabel={`POS: ${formatCurrencyIDR(stats.todayPosRevenue)} | Book: ${formatCurrencyIDR(stats.todayBookingRevenue)}`}
					color="green"
				/>
				<StatCard
					icon={<Coffee className="w-5 h-5" />}
					label="Produk Aktif"
					value={stats.activeProducts.toString()}
					subLabel={`${stats.totalProducts} produk total`}
					color="accent"
				/>
				<StatCard
					icon={<Wallet className="w-5 h-5" />}
					label="Saldo Kas"
					value={formatCurrencyIDR(stats.netBalance)}
					trend={stats.netBalance >= 0 ? "up" : "down"}
					color={stats.netBalance >= 0 ? "green" : "red"}
				/>
			</div>

			{/* Shift Information */}
			{shiftStatus?.allShifts && shiftStatus.allShifts.length > 0 && (
				<motion.div
					className="rounded-3xl border border-border bg-card p-6 shadow-sm overflow-hidden relative"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
				>
					<div className="absolute top-0 left-0 w-1 h-full bg-primary/20" />
					<div className="flex items-center justify-between mb-5">
						<h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
							<Clock className="w-5 h-5 text-primary" />
							Sesi Kasir Hari Ini
						</h3>
						<span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md font-medium">
							{shiftStatus.allShifts.length} Sesi
						</span>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{shiftStatus.allShifts.map((shift: any, i: number) => {
							const isActive = !shift.endTime;
							
							return (
								<div 
									key={i} 
									onClick={() => {
										setSelectedShift(shift);
										setIsShiftModalOpen(true);
									}}
									className={`p-4 rounded-2xl border transition-all hover:shadow-md cursor-pointer active:scale-[0.98] ${isActive ? 'border-emerald-200 bg-emerald-50/50 ring-1 ring-emerald-100' : 'border-border bg-muted/20'}`}
								>
									<div className="flex justify-between items-start mb-3">
										<div>
											<p className="font-bold text-sm text-foreground">{shift.shiftName || `Shift ${i + 1}`}</p>
											<p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
												<Users className="w-3 h-3 text-muted-foreground/70" />
												{shift.cashierName || 'Unknown'}
											</p>
										</div>
										<span className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full uppercase ${isActive ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-200 text-slate-600'}`}>
											{isActive ? 'Ongoing' : 'Closed'}
										</span>
									</div>
									<div className="space-y-2 text-xs mt-3 pt-3 border-t border-border/40">
										<div className="flex justify-between items-center">
											<span className="text-muted-foreground">Cash (Laci):</span>
											<span className="font-medium text-foreground">{formatCurrencyIDR(shift.cashRevenue)}</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-muted-foreground">E-Wallet/QRIS:</span>
											<span className="font-medium text-foreground">{formatCurrencyIDR(shift.qrisRevenue)}</span>
										</div>
										<div className="flex justify-between pt-2 mt-1 border-t border-dashed border-border/60">
											<span className="text-muted-foreground font-semibold">Subtotal:</span>
											<span className="font-semibold text-primary">{formatCurrencyIDR(shift.revenue)}</span>
										</div>
										<div className="flex justify-between pt-2 mt-1 border-t border-border/40 text-[10px]">
											<span className="text-muted-foreground">Modal Awal:</span>
											<span className="font-medium text-muted-foreground">{formatCurrencyIDR(shift.modalAwal || 0)}</span>
										</div>
										{shift.setoranAkhir !== undefined && (
											<div className="flex justify-between text-[10px]">
												<span className="text-muted-foreground">Fisik/Saran:</span>
												<span className="font-medium text-emerald-600">{formatCurrencyIDR(shift.setoranAkhir)}</span>
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>

					<ShiftDetailModal 
						shift={selectedShift}
						isOpen={isShiftModalOpen}
						onOpenChange={setIsShiftModalOpen}
					/>
				</motion.div>
			)}

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<FinancialTargetPanel compact />
				<div className="space-y-4">
					<h3 className="font-bold text-lg tracking-tight">Kinerja Finansial</h3>
					<PeriodComparisonCards />
				</div>
			</div>

			<TrendChart />

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Revenue Chart */}
				<motion.div
					className="rounded-3xl border border-border bg-card p-6 shadow-sm"
					initial={{ opacity: 0, scale: 0.98 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ delay: 0.1 }}
				>
					<div className="mb-6 flex items-center justify-between">
						<div>
							<h3 className="font-bold text-lg tracking-tight">Grafik Pendapatan</h3>
							<p className="text-xs text-muted-foreground">7 Hari Terakhir</p>
						</div>
						<div className="flex items-center gap-2 text-primary-foreground bg-primary px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm">
							<TrendingUp className="w-4 h-4" />
							<span>{formatCurrencyIDR(sevenDayRevenue)}</span>
						</div>
					</div>
					<div className="flex items-end justify-between gap-3 h-48 pt-8">
						{stats.revenueLast7Days.map((day: any, i: number) => (
							<div key={i} className="flex flex-1 flex-col items-center gap-3 group h-full">
								<div className="relative w-full flex-1 flex items-end">
									<motion.div
										className="w-full rounded-t-xl bg-gradient-to-t from-primary/80 to-primary hover:from-primary hover:to-primary transition-all cursor-pointer shadow-sm group-hover:shadow-md"
										initial={{ height: 0 }}
										animate={{ 
											height: `${Math.max((day.revenue / maxRevenue) * 100, 8)}%` 
										}}
										transition={{ duration: 0.6, delay: i * 0.08, ease: "easeOut" }}
									>
										{day.revenue > 0 && (
											<div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-primary bg-primary/5 px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-primary/10">
												{formatCurrencyIDR(day.revenue)}
											</div>
										)}
										<div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-t-xl" />
									</motion.div>
								</div>
								<span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{day.date.split(',')[0]}</span>
							</div>
						))}
					</div>
				</motion.div>

				{/* Order Status Breakdown */}
				<motion.div
					className="rounded-3xl border border-border bg-card p-6 shadow-sm"
					initial={{ opacity: 0, scale: 0.98 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ delay: 0.2 }}
				>
					<h3 className="mb-6 font-bold text-lg tracking-tight">Breakdown Pesanan</h3>
					<div className="space-y-4">
						<StatusRow
							label="Menunggu"
							count={stats.orderStatusBreakdown.pending}
							total={stats.todayOrders + stats.pendingOrders}
							color="yellow"
							icon={<Clock className="w-4 h-4" />}
						/>
						<StatusRow
							label="Dibayar"
							count={stats.orderStatusBreakdown.paid}
							total={stats.todayOrders + stats.pendingOrders}
							color="blue"
							icon={<Wallet className="w-4 h-4" />}
						/>
						<StatusRow
							label="Selesai"
							count={stats.orderStatusBreakdown.completed}
							total={stats.todayOrders + stats.pendingOrders}
							color="green"
							icon={<TrendingUp className="w-4 h-4" />}
						/>
						<StatusRow
							label="Dibatalkan"
							count={stats.orderStatusBreakdown.cancelled}
							total={stats.todayOrders + stats.pendingOrders}
							color="red"
							icon={<ArrowDownRight className="w-4 h-4" />}
						/>
					</div>
					<div className="mt-6 pt-4 border-t border-border/50">
						<div className="flex justify-between items-center text-sm">
							<span className="text-muted-foreground font-medium">Total Volume Pesanan</span>
							<span className="font-semibold text-lg">
								{stats.orderStatusBreakdown.pending +
									stats.orderStatusBreakdown.paid +
									stats.orderStatusBreakdown.completed +
									stats.orderStatusBreakdown.cancelled}
							</span>
						</div>
					</div>
				</motion.div>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				{/* Low Stock Alert */}
				<motion.div
					className="rounded-3xl border border-border bg-card p-6 shadow-sm"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3 }}
				>
					<div className="mb-5 flex items-center justify-between">
						<div>
							<h3 className="font-bold text-lg tracking-tight">Stok Kritis</h3>
							<p className="text-xs text-muted-foreground">Persediaan Rendah</p>
						</div>
						{stats.lowStockCount > 0 && (
							<span className="rounded-full bg-destructive text-destructive-foreground px-2.5 py-1 text-[10px] font-semibold shadow-sm">
								{stats.lowStockCount}
							</span>
						)}
					</div>
					{stats.lowStockItems.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
							<Package className="w-12 h-12 text-muted-foreground/30 mb-3" />
							<p className="text-muted-foreground text-sm font-medium">Inventori Aman</p>
						</div>
					) : (
						<div className="space-y-1.5">
							{stats.lowStockItems.map((item: any) => (
								<Link
									key={item._id}
									to="/admin/inventory"
									className="flex items-center justify-between rounded-xl border border-destructive/10 bg-destructive/5 p-2 group hover:bg-destructive/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
								>
									<div className="flex items-center gap-2">
										<div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
											<AlertTriangle className="w-3.5 h-3.5 text-destructive" />
										</div>
										<span className="text-xs font-semibold truncate max-w-[140px]">{item.ingredientName}</span>
									</div>
									<span className="text-[10px] font-bold text-destructive bg-white/50 px-1.5 py-0.5 rounded-md shrink-0">
										{item.quantity}/{item.lowStockThreshold} {item.unit}
									</span>
								</Link>
							))}
						</div>
					)}
				</motion.div>

				{/* Top Products */}
				<motion.div
					className="rounded-3xl border border-border bg-card p-6 shadow-sm"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4 }}
				>
					<h3 className="mb-5 font-bold text-lg tracking-tight">Best Sellers</h3>
					{stats.topProducts.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
							<Coffee className="w-12 h-12 text-muted-foreground/30 mb-3" />
							<p className="text-muted-foreground text-sm font-medium">Belum ada tren</p>
						</div>
					) : (
						<div className="space-y-1.5">
							{stats.topProducts.map((product: any, i: number) => (
								<Link
									key={product.name}
									to="/admin/products"
									className="flex items-center gap-3 rounded-xl bg-muted/30 p-2 hover:bg-muted/50 transition-all hover:scale-[1.02] active:scale-[0.98] group"
								>
									<div className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-[10px] font-bold shadow-sm">
										{i + 1}
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-xs font-bold truncate text-foreground">{product.name}</p>
										<p className="text-[9px] font-medium text-muted-foreground">
											{product.count} unit terjual
										</p>
									</div>
									<span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-lg shrink-0">
										{(product.revenue / 1000).toFixed(0)}k
									</span>
								</Link>
							))}
						</div>
					)}
				</motion.div>

				{/* Recent Orders */}
				<motion.div
					className="rounded-3xl border border-border bg-card p-6 shadow-sm"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.5 }}
				>
					<h3 className="mb-5 font-bold text-lg tracking-tight">Riwayat Terbaru</h3>
					{stats.recentOrders.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 text-center bg-muted/20 rounded-2xl border border-dashed border-border">
							<ShoppingCart className="w-12 h-12 text-muted-foreground/30 mb-3" />
							<p className="text-muted-foreground text-sm font-medium">Data kosong</p>
						</div>
					) : (
						<div className="space-y-1.5">
							{stats.recentOrders.map((order: any) => (
								<Link
									key={order._id}
									to="/admin/orders"
									className="flex items-center justify-between rounded-xl bg-muted/30 p-2 hover:bg-muted/50 transition-all hover:scale-[1.02] active:scale-[0.98] border border-transparent hover:border-border"
								>
									<div className="flex-1 min-w-0">
										<p className="text-xs font-bold text-foreground">#{order.orderNumber}</p>
										<p className="text-[9px] font-medium text-muted-foreground flex items-center gap-1 mt-0.5">
											<Clock className="w-2.5 h-2.5" />
											{new Date(order.createdAt).toLocaleTimeString("id-ID", {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</p>
									</div>
									<div className="text-right shrink-0">
										<p className="text-xs font-bold text-foreground">
											{formatCurrencyIDR(order.totalAmount)}
										</p>
										<span
											className={`text-[8px] font-bold uppercase tracking-tighter px-1 py-0.5 rounded-md ${
												order.status === "completed"
													? "bg-green-100 text-green-700"
													: order.status === "paid"
														? "bg-blue-100 text-blue-700"
														: order.status === "pending"
															? "bg-yellow-100 text-yellow-700"
															: "bg-red-100 text-red-700"
											}`}
										>
											{order.status === "completed"
												? "Selesai"
												: order.status === "paid"
													? "Lunas"
													: order.status === "pending"
														? "Draft"
														: "Batal"}
										</span>
									</div>
								</Link>
							))}
						</div>
					)}
				</motion.div>
			</div>

			{/* Financial Summary */}
			<motion.div
				className="rounded-3xl border border-border bg-card p-6 shadow-sm overflow-hidden relative"
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.6 }}
			>
				<div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl text-primary" />
				<h3 className="mb-6 font-bold text-xl tracking-tight">Ringkasan Keuangan Global</h3>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<div className="rounded-2xl bg-emerald-500/10 p-5 border border-emerald-500/10">
						<div className="flex items-center gap-3 text-emerald-600 mb-3">
							<div className="p-2 rounded-lg bg-emerald-500/20">
								<ArrowUpRight className="w-5 h-5" />
							</div>
							<span className="text-xs font-bold uppercase tracking-wider">Inflow Hari Ini</span>
						</div>
						<p className="font-bold text-2xl text-emerald-700 tracking-tight">
							{formatCurrencyIDR(stats.todayIncome)}
						</p>
						<p className="text-[10px] text-emerald-600/70 mt-1 font-medium">
							Total akumulasi kas masuk
						</p>
					</div>

					<div className="rounded-2xl bg-rose-500/10 p-5 border border-rose-500/10">
						<div className="flex items-center gap-3 text-rose-600 mb-3">
							<div className="p-2 rounded-lg bg-rose-500/20">
								<ArrowDownRight className="w-5 h-5" />
							</div>
							<span className="text-xs font-bold uppercase tracking-wider">Outflow Hari Ini</span>
						</div>
						<p className="font-bold text-2xl text-rose-700 tracking-tight">
							{formatCurrencyIDR(stats.todayExpense)}
						</p>
						<p className="text-[10px] text-rose-600/70 mt-1 font-medium font-bold">
							Total: {formatCurrencyIDR(stats.totalExpense)}
						</p>
					</div>

					<div className="rounded-2xl bg-indigo-500/10 p-5 border border-indigo-500/10">
						<div className="flex items-center gap-3 text-indigo-600 mb-3">
							<div className="p-2 rounded-lg bg-indigo-500/20">
								<Wallet className="w-5 h-5" />
							</div>
							<span className="text-xs font-bold uppercase tracking-wider">Net Balance</span>
						</div>
						<p className={`font-bold text-2xl tracking-tight ${stats.netBalance >= 0 ? "text-indigo-700" : "text-rose-700"}`}>
							{formatCurrencyIDR(stats.netBalance)}
						</p>
						<p className="text-[10px] text-indigo-600/70 mt-1 font-medium italic">
							Profit: {formatCurrencyIDR(stats.todayIncome - stats.todayExpense)}
						</p>
					</div>

					<div className="rounded-2xl bg-amber-500/10 p-5 border border-amber-500/10">
						<div className="flex items-center gap-3 text-amber-600 mb-3">
							<div className="p-2 rounded-lg bg-amber-500/20">
								<Users className="w-5 h-5" />
							</div>
							<span className="text-xs font-bold uppercase tracking-wider">Avg Ticket</span>
						</div>
						<p className="font-bold text-2xl text-amber-700 tracking-tight">
							{formatCurrencyIDR(stats.todayOrders > 0 ? Math.round(stats.todayRevenue / stats.todayOrders) : 0)}
						</p>
						<p className="text-[10px] text-amber-600/70 mt-1 font-medium">
							Rata-rata per transaksi
						</p>
					</div>
				</div>
				
				<div className="mt-8 pt-4 border-t border-border/50 flex flex-wrap gap-3">
					<a
						href="/admin/finance/reports"
						className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground transition-all hover:shadow-lg hover:scale-105 active:scale-95"
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
						Unduh Laporan Lengkap
					</a>
					<a
						href="/admin/finance"
						className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-xs font-bold text-muted-foreground transition-all hover:bg-muted hover:text-foreground shadow-sm"
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
						Manajemen Transaksi
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
	const colorThemes = {
		primary: "bg-primary/10 text-primary border-primary/20",
		green: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
		red: "bg-rose-500/10 text-rose-500 border-rose-500/20",
		accent: "bg-amber-500/10 text-amber-500 border-amber-500/20",
	};

	const iconColors = {
		primary: "text-primary",
		green: "text-emerald-500",
		red: "text-rose-500",
		accent: "text-amber-500",
	};

	return (
		<motion.div
			className="rounded-3xl border border-border bg-card p-5 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow"
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.4 }}
		>
			<div className={`absolute top-0 right-0 w-24 h-24 blur-3xl opacity-10 rounded-full -mr-8 -mt-8 ${colorThemes[color]}`} />
			<div className="flex items-center justify-between mb-4">
				<div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/50 ${iconColors[color]}`}>
					{icon}
				</div>
				{trend && (
					<div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-tighter px-2 py-0.5 rounded-full ${trend === "up" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"} shadow-sm`}>
						{trend === "up" ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
						{trend === "up" ? "Gain" : "Loss"}
					</div>
				)}
			</div>
			<p className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">{label}</p>
			<p className="mt-1 font-bold text-xl tracking-tight text-foreground">{value}</p>
			{subLabel && (
				<p className="text-muted-foreground text-[10px] mt-1 line-clamp-1 font-semibold">{subLabel}</p>
			)}
		</motion.div>
	);
}

// Status Row Component
function StatusRow({
	label,
	count,
	total,
	color,
	icon,
}: {
	label: string;
	count: number;
	total: number;
	color: "yellow" | "blue" | "green" | "red";
	icon: React.ReactNode;
}) {
	const colorClasses = {
		yellow: "bg-amber-500/10 text-amber-600 border-amber-500/20",
		blue: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
		green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
		red: "bg-rose-500/10 text-rose-600 border-rose-500/20",
	};

	const barColors = {
		yellow: "bg-amber-500",
		blue: "bg-indigo-500",
		green: "bg-emerald-500",
		red: "bg-rose-500",
	};

	const percentage = Math.min((count / (total || 1)) * 100, 100);

	return (
		<div className="flex items-center gap-4 group">
			<div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${colorClasses[color]} group-hover:scale-110 transition-transform`}>
				{icon}
			</div>
			<div className="flex-1">
				<div className="flex items-center justify-between mb-1.5">
					<span className="text-xs font-bold text-foreground">{label}</span>
					<span className="text-xs font-black text-foreground bg-muted px-1.5 py-0.5 rounded-md">{count}</span>
				</div>
				<div className="h-2 rounded-full bg-muted overflow-hidden">
					<motion.div
						className={`h-full rounded-full ${barColors[color]}`}
						initial={{ width: 0 }}
						animate={{ width: `${percentage}%` }}
						transition={{ duration: 1, ease: "easeOut" }}
					/>
				</div>
			</div>
		</div>
	);
}
