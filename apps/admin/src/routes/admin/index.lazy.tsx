import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import {
	AlertTriangle,
	ArrowDownRight,
	ArrowUpRight,
	Bell,
	Clock,
	Coffee,
	FileBarChart,
	Package,
	ShoppingCart,
	TrendingUp,
	Users,
	Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FinancialTargetPanel } from "./finance/-components/financial-target-panel";
import { PeriodComparisonCards, TrendChart } from "./finance/-components/finance-charts";
import { useMemo, useState } from "react";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { ShiftDetailModal } from "./-components/ShiftDetailModal";
import {
	useHybridDashboardStats,
	useHybridShiftStatus,
} from "@/hooks/use-hybrid-pos-data";

import OperationalDecisionDashboard from "./-OperationalDecisionDashboard";

export const Route = createLazyFileRoute("/admin/")({
	component: OperationalDecisionDashboard,
});

// The domain root (/) must use the same current decision dashboard as /admin/.
// Keep DashboardAdmin exported for legacy imports, but do not mount it at root.

export function DashboardAdmin() {
	const stats = useHybridDashboardStats();
	const shiftStatus = useHybridShiftStatus();
	const [selectedShift, setSelectedShift] = useState<any>(null);
	const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
	const validShifts = useMemo(
		() => shiftStatus?.allShifts?.filter((shift: any) => shift != null) ?? [],
		[shiftStatus?.allShifts]
	);

	if (stats == null || shiftStatus == null) {
		return (
			<div className="space-y-3 pb-6">
				<div className="flex items-center justify-between">
					<div className="space-y-1.5">
						<Skeleton className="h-3 w-32 rounded" />
						<Skeleton className="h-3 w-48 rounded" />
					</div>
					<div className="flex gap-1.5">
						<Skeleton className="h-5 w-16 rounded" />
						<Skeleton className="h-5 w-20 rounded" />
						<Skeleton className="h-5 w-24 rounded" />
					</div>
				</div>
				<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="rounded-xl border border-border bg-card p-2.5">
							<Skeleton className="h-3 w-20 mb-1" />
							<Skeleton className="h-4 w-28" />
						</div>
					))}
				</div>
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<Skeleton className="h-24 w-full rounded-xl" />
					<Skeleton className="h-24 w-full rounded-xl" />
				</div>
				<Skeleton className="h-32 w-full rounded-xl" />
			</div>
		);
	}

	const maxRevenue = Math.max(...stats.revenueLast7Days.map((d: any) => d.revenue), 1);
	const sevenDayRevenue = stats.revenueLast7Days.reduce((sum: number, day: any) => sum + day.revenue, 0);

	return (
		<div className="space-y-4 pb-6">
			<section className="grid gap-3 rounded-[24px] border border-border/80 bg-card/95 p-4 shadow-[var(--shadow-soft)] sm:p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
				<div className="min-w-0">
					<div className="mb-3 flex items-center gap-2 text-primary">
						<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
							<TrendingUp className="h-4 w-4" />
						</span>
						<span className="text-xs font-semibold uppercase tracking-[0.12em]">Ringkasan 7 hari</span>
					</div>
					<h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
						Pusat Pantau Operasional
					</h1>
					<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
						Monitor pesanan, selisih kas, dan anomali yang perlu ditindaklanjuti.
					</p>
					<div className="mt-4">
						<p className="text-xs font-medium text-muted-foreground">Pendapatan 7 hari</p>
						<p className="mt-1 break-words font-display text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
							{formatCurrencyIDR(sevenDayRevenue)}
						</p>
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						<Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" to="/admin/finance">
							<Wallet className="h-4 w-4" /> Buka Keuangan
						</Link>
						<Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" to="/admin/finance/reports">
							<FileBarChart className="h-4 w-4" /> Lihat Laporan
						</Link>
						<Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" to="/admin/pos-notifications">
							<Bell className="h-4 w-4" /> Kirim Notifikasi POS
						</Link>
					</div>
				</div>
				<div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
					<div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-3">
						<p className="text-xs font-semibold text-amber-800">Rekonsiliasi tertunda</p>
						<p className="mt-1 text-xl font-bold tabular-nums text-amber-900">{stats.paymentReconciliation.pendingNonCashCount}</p>
						<p className="text-xs text-amber-800/80">transaksi QRIS/transfer perlu diperiksa</p>
					</div>
					<div className="rounded-xl border border-border bg-muted/30 p-3">
						<p className="text-xs font-semibold text-muted-foreground">Anomali hari ini</p>
						<p className="mt-1 text-xl font-bold tabular-nums text-foreground">{stats.anomalies.length}</p>
						<p className="text-xs text-muted-foreground">temuan otomatis pada operasional</p>
					</div>
				</div>
			</section>

			{/* Supporting metrics */}
			<section aria-label="Metrik operasional hari ini" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
				<CompactStat
					icon={<ShoppingCart className="w-3.5 h-3.5" />}
					label="Pesanan Hari Ini"
					value={stats.todayOrders.toString()}
					sub={`${stats.pendingOrders} menunggu`}
					color="primary"
				/>
				<CompactStat
					icon={<Coffee className="w-3.5 h-3.5" />}
					label="Produk Aktif"
					value={stats.activeProducts.toString()}
					sub={`${stats.totalProducts} total`}
					color="accent"
				/>
				<CompactStat
					icon={<Wallet className="w-3.5 h-3.5" />}
					label="Saldo Kas"
					value={formatCurrencyIDR(stats.netBalance)}
					trend={stats.netBalance >= 0 ? "up" : "down"}
					color={stats.netBalance >= 0 ? "green" : "red"}
				/>
			</section>

			<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
				<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)]">
					<div className="flex items-center justify-between mb-2">
						<h3 className="text-xs font-bold flex items-center gap-1.5">
							<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
							Selisih Kas &amp; Rekonsiliasi
						</h3>
						<span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
							{stats.cashDiscrepancySummary.highRiskShiftCount} risiko tinggi
						</span>
					</div>
					<div className="flex gap-2">
						<div className="flex-1 rounded-lg border border-border bg-muted/20 p-2">
							<p className="text-[11px] font-semibold text-muted-foreground">Gap Kas Fisik</p>
							<p className={`text-sm font-bold ${stats.cashDiscrepancySummary.totalPhysicalGap === 0 ? "text-emerald-600" : "text-rose-600"}`}>
								{formatCurrencyIDR(stats.cashDiscrepancySummary.totalPhysicalGap)}
							</p>
						</div>
						<div className="flex-1 rounded-lg border border-border bg-muted/20 p-2">
							<p className="text-[11px] font-semibold text-muted-foreground">Gap Non-Tunai</p>
							<p className={`text-sm font-bold ${stats.cashDiscrepancySummary.totalNonCashGap === 0 ? "text-emerald-600" : "text-rose-600"}`}>
								{formatCurrencyIDR(stats.cashDiscrepancySummary.totalNonCashGap)}
							</p>
						</div>
						<div className="flex-1 rounded-lg border border-border bg-muted/20 p-2">
							<p className="text-[11px] font-semibold text-muted-foreground">Pending QRIS/TF</p>
							<p className="text-sm font-bold text-amber-600">{stats.paymentReconciliation.pendingNonCashCount}</p>
							<p className="text-[11px] text-muted-foreground">{formatCurrencyIDR(stats.paymentReconciliation.pendingNonCashAmount)}</p>
						</div>
					</div>
				</div>

				<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)]">
					<div className="flex items-center justify-between mb-2">
						<h3 className="text-xs font-bold flex items-center gap-1.5">
							<AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
							Anomali Otomatis
						</h3>
						<span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
							{stats.anomalies.length} temuan
						</span>
					</div>
					<div className="space-y-1">
						{stats.anomalies.length === 0 ? (
							<div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-[10px] text-muted-foreground">
								Belum ada anomali penting terdeteksi hari ini.
							</div>
						) : (
							stats.anomalies.map((anomaly: any, index: number) => (
								<div key={`${anomaly.type}-${index}`} className="rounded-lg border border-border bg-muted/20 p-2">
									<div className="flex items-center justify-between gap-2">
										<p className="font-semibold text-[11px]">{anomaly.title}</p>
										<Badge className="px-1.5 py-0 text-[10px] uppercase" variant={anomaly.severity === "high" ? "destructive" : "warning"}>
											{anomaly.severity}
										</Badge>
									</div>
									<p className="mt-0.5 text-[10px] text-muted-foreground">{anomaly.description}</p>
								</div>
							))
						)}
					</div>
				</div>
			</div>

			{/* Shift Information */}
			{validShifts.length > 0 && (
				<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)]">
					<div className="flex items-center justify-between mb-2">
						<h3 className="text-xs font-bold flex items-center gap-1.5">
							<Clock className="w-3.5 h-3.5 text-primary" />
							Sesi Kasir Hari Ini
						</h3>
						<span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
							{validShifts.length} Sesi
						</span>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
						{validShifts.map((shift: any, i: number) => {
							const isActive = !shift.endTime;
							
							return (
								<button
									key={i}
									onClick={() => {
										setSelectedShift(shift);
										setIsShiftModalOpen(true);
									}}
									type="button"
									className={`min-h-11 w-full rounded-xl border p-2.5 text-left transition-all hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isActive ? 'border-emerald-200 bg-emerald-50/50 ring-1 ring-emerald-100' : 'border-border bg-muted/20'}`}
								>
									<div className="flex justify-between items-start mb-1.5">
										<div>
											<p className="font-semibold text-[11px] text-foreground">{shift.shiftName || `Shift ${i + 1}`}</p>
											<p className="text-[11px] text-muted-foreground flex items-center gap-1">
												<Users className="w-2.5 h-2.5" />
												{shift.cashierName || 'Unknown'}
											</p>
										</div>
										<Badge className="px-1.5 py-0 text-[10px] uppercase" variant={isActive ? "success" : "secondary"}>
											{isActive ? 'Ongoing' : 'Closed'}
										</Badge>
									</div>
									<div className="space-y-1 text-[10px] pt-1.5 border-t border-border/40">
										<div className="flex justify-between">
											<span className="text-muted-foreground">Cash:</span>
											<span className="font-medium text-foreground">{formatCurrencyIDR(shift.cashRevenue)}</span>
										</div>
										<div className="flex justify-between">
											<span className="text-muted-foreground">QRIS/E-Wallet:</span>
											<span className="font-medium text-foreground">{formatCurrencyIDR(shift.qrisRevenue)}</span>
										</div>
										<div className="flex justify-between">
											<span className="text-muted-foreground">Diskon:</span>
											<span className="text-orange-600">-{formatCurrencyIDR(shift.totalDiscount || 0)}</span>
										</div>
										<div className="flex justify-between pt-1 mt-1 border-t border-dashed border-border/60 font-semibold">
											<span className="text-muted-foreground">Net Revenue:</span>
											<span className="text-primary">{formatCurrencyIDR(shift.revenue)}</span>
										</div>
									</div>
								</button>
							);
						})}
					</div>

					<ShiftDetailModal 
						shift={selectedShift}
						isOpen={isShiftModalOpen}
						onOpenChange={setIsShiftModalOpen}
					/>
				</div>
			)}

			<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
				<FinancialTargetPanel compact />
				<div className="space-y-1">
					<h3 className="font-bold text-xs tracking-tight text-muted-foreground">Kinerja Finansial</h3>
					<PeriodComparisonCards />
				</div>
			</div>

			<TrendChart />

			<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
				{/* Revenue Chart */}
				<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)]">
					<div className="flex items-center justify-between mb-3">
						<div>
							<h3 className="text-xs font-bold">Grafik Pendapatan</h3>
							<p className="text-[11px] text-muted-foreground">7 Hari Terakhir</p>
						</div>
						<div className="flex items-center gap-1.5 text-primary-foreground bg-primary px-2 py-1 rounded-lg text-[11px] font-bold">
							<TrendingUp className="w-3 h-3" />
							<span>{formatCurrencyIDR(sevenDayRevenue)}</span>
						</div>
					</div>
					<div className="flex items-end justify-between gap-2 h-32 pt-4">
						{stats.revenueLast7Days.map((day: any, i: number) => (
							<div key={i} className="flex flex-1 flex-col items-center gap-1.5 group h-full">
								<div className="relative w-full flex-1 flex items-end">
									<div
										className="w-full rounded-t-lg bg-primary/70 hover:bg-primary transition-all cursor-pointer" 
										style={{ height: `${Math.max((day.revenue / maxRevenue) * 100, 6)}%` }}
									>
										{day.revenue > 0 && (
											<div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-primary bg-primary/5 px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-primary/10">
												{formatCurrencyIDR(day.revenue)}
											</div>
										)}
									</div>
								</div>
								<span className="text-[10px] text-muted-foreground font-semibold uppercase">{day.date.split(',')[0]}</span>
							</div>
						))}
					</div>
				</div>

				{/* Order Status Breakdown */}
				<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)]">
					<h3 className="text-xs font-bold mb-3">Breakdown Pesanan</h3>
					<div className="space-y-2">
						<CompactStatusRow
							label="Open Bill"
							count={stats.orderStatusBreakdown.pending}
							total={stats.todayOrders + stats.pendingOrders}
							color="yellow"
							icon={<Clock className="w-3 h-3" />}
						/>
						<CompactStatusRow
							label="Lunas"
							count={stats.orderStatusBreakdown.paid}
							total={stats.todayOrders + stats.pendingOrders}
							color="blue"
							icon={<Wallet className="w-3 h-3" />}
						/>
						<CompactStatusRow
							label="Selesai"
							count={stats.orderStatusBreakdown.completed}
							total={stats.todayOrders + stats.pendingOrders}
							color="green"
							icon={<TrendingUp className="w-3 h-3" />}
						/>
						<CompactStatusRow
							label="Dibatalkan"
							count={stats.orderStatusBreakdown.cancelled}
							total={stats.todayOrders + stats.pendingOrders}
							color="red"
							icon={<ArrowDownRight className="w-3 h-3" />}
						/>
					</div>
					<div className="mt-3 pt-2 border-t border-border/50 flex justify-between items-center">
						<span className="text-[10px] text-muted-foreground font-medium">Total Volume Pesanan</span>
						<span className="font-bold text-xs">
							{stats.orderStatusBreakdown.pending +
								stats.orderStatusBreakdown.paid +
								stats.orderStatusBreakdown.completed +
								stats.orderStatusBreakdown.cancelled}
						</span>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
				{/* Low Stock Alert */}
				<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)]">
					<div className="flex items-center justify-between mb-2">
						<div>
							<h3 className="text-xs font-bold">Stok Kritis</h3>
							<p className="text-[11px] text-muted-foreground">Persediaan Rendah</p>
						</div>
						{stats.lowStockCount > 0 && (
							<span className="rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.5 text-[10px] font-semibold">
								{stats.lowStockCount}
							</span>
						)}
					</div>
					{stats.lowStockItems.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-6 text-center bg-muted/20 rounded-lg border border-dashed border-border">
							<Package className="w-8 h-8 text-muted-foreground/30 mb-2" />
							<p className="text-muted-foreground text-[10px] font-medium">Inventori Aman</p>
						</div>
					) : (
						<div className="space-y-1">
							{stats.lowStockItems.map((item: any) => (
								<Link
									key={item._id}
									to="/admin/inventory"
									className="flex items-center justify-between rounded-lg border border-destructive/10 bg-destructive/5 p-1.5 hover:bg-destructive/10 transition-colors"
								>
									<div className="flex items-center gap-1.5 min-w-0">
										<AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
										<span className="text-[10px] font-semibold truncate">{item.ingredientName}</span>
									</div>
									<span className="text-[10px] font-bold text-destructive bg-white/50 px-1 py-0.5 rounded shrink-0">
										{item.quantity}/{item.lowStockThreshold} {item.unit}
									</span>
								</Link>
							))}
						</div>
					)}
				</div>

				{/* Top Products */}
				<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)]">
					<h3 className="text-xs font-bold mb-2">Best Sellers</h3>
					{stats.topProducts.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-6 text-center bg-muted/20 rounded-lg border border-dashed border-border">
							<Coffee className="w-8 h-8 text-muted-foreground/30 mb-2" />
							<p className="text-muted-foreground text-[10px] font-medium">Belum ada tren</p>
						</div>
					) : (
						<div className="space-y-1">
							{stats.topProducts.map((product: any, i: number) => (
								<Link
									key={product.name}
									to="/admin/products"
									className="flex items-center gap-2 rounded-lg bg-muted/30 p-1.5 hover:bg-muted/50 transition-colors group"
								>
									<div className="w-5 h-5 shrink-0 flex items-center justify-center rounded bg-primary text-primary-foreground text-[10px] font-bold">
										{i + 1}
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-[10px] font-bold truncate text-foreground">{product.name}</p>
										<p className="text-[10px] font-medium text-muted-foreground">{product.count} unit</p>
									</div>
									<span className="text-[10px] font-bold text-primary bg-primary/10 px-1 py-0.5 rounded shrink-0">
										{(product.revenue / 1000).toFixed(0)}k
									</span>
								</Link>
							))}
						</div>
					)}
				</div>

				{/* Recent Orders */}
				<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)]">
					<h3 className="text-xs font-bold mb-2">Riwayat Terbaru</h3>
					{stats.recentOrders.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-6 text-center bg-muted/20 rounded-lg border border-dashed border-border">
							<ShoppingCart className="w-8 h-8 text-muted-foreground/30 mb-2" />
							<p className="text-muted-foreground text-[10px] font-medium">Data kosong</p>
						</div>
					) : (
						<div className="space-y-1">
							{stats.recentOrders.map((order: any) => (
								<Link
									key={order._id}
									to="/admin/orders"
									className="flex items-center justify-between rounded-lg bg-muted/30 p-1.5 hover:bg-muted/50 transition-colors"
								>
									<div className="flex-1 min-w-0">
										<p className="text-[10px] font-bold text-foreground">#{getDisplayOrderNumber(order.orderNumber, { sequence: order.dailyReceiptNo ?? order.daily_receipt_no, createdAt: order.createdAt ?? order._creationTime, source: order.source, sourceApp: order.sourceApp, businessUnit: order.businessUnit, orderType: order.orderType, platform: order.platform, brandSlug: order.brandSlug ?? order.brand_slug })}</p>
										<p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
											<Clock className="w-2 h-2" />
											{new Date(order.createdAt).toLocaleTimeString("id-ID", {
												hour: "2-digit",
												minute: "2-digit",
											})}
										</p>
									</div>
									<div className="text-right shrink-0">
										<p className="text-[10px] font-bold text-foreground">{formatCurrencyIDR(order.totalAmount)}</p>
										<Badge className="px-1 py-0 text-[7px] uppercase" variant={
											order.status === "completed" ? "success" : order.status === "paid" ? "info" : order.status === "pending" ? "warning" : "destructive"
										}>
											{order.status === "completed" ? "Selesai" : order.status === "paid" ? "Lunas" : order.status === "pending" ? "Draft" : "Batal"}
										</Badge>
									</div>
								</Link>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Financial Summary */}
			<div className="rounded-2xl border border-border/80 bg-card p-3 shadow-[var(--shadow-soft)] relative">
				<h3 className="text-xs font-bold mb-2">Ringkasan Keuangan Global</h3>
				<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
					<div className="rounded-lg bg-emerald-500/10 p-2 border border-emerald-500/10">
						<div className="flex items-center gap-1.5 text-emerald-600 mb-0.5">
							<ArrowUpRight className="w-3 h-3" />
							<span className="text-[10px] font-bold uppercase">Inflow</span>
						</div>
						<p className="font-bold text-xs text-emerald-700">{formatCurrencyIDR(stats.todayIncome)}</p>
					</div>
					<div className="rounded-lg bg-rose-500/10 p-2 border border-rose-500/10">
						<div className="flex items-center gap-1.5 text-rose-600 mb-0.5">
							<ArrowDownRight className="w-3 h-3" />
							<span className="text-[10px] font-bold uppercase">Outflow</span>
						</div>
						<p className="font-bold text-xs text-rose-700">{formatCurrencyIDR(stats.todayExpense)}</p>
						<p className="text-[7px] text-rose-600/70">Total: {formatCurrencyIDR(stats.totalExpense)}</p>
					</div>
					<div className="rounded-lg bg-indigo-500/10 p-2 border border-indigo-500/10">
						<div className="flex items-center gap-1.5 text-indigo-600 mb-0.5">
							<Wallet className="w-3 h-3" />
							<span className="text-[10px] font-bold uppercase">Net Balance</span>
						</div>
						<p className={`font-bold text-xs ${stats.netBalance >= 0 ? "text-indigo-700" : "text-rose-700"}`}>{formatCurrencyIDR(stats.netBalance)}</p>
						<p className="text-[7px] text-indigo-600/70 italic">Profit: {formatCurrencyIDR(stats.todayIncome - stats.todayExpense)}</p>
					</div>
					<div className="rounded-lg bg-amber-500/10 p-2 border border-amber-500/10">
						<div className="flex items-center gap-1.5 text-amber-600 mb-0.5">
							<Users className="w-3 h-3" />
							<span className="text-[10px] font-bold uppercase">Avg Ticket</span>
						</div>
						<p className="font-bold text-xs text-amber-700">{formatCurrencyIDR(stats.todayOrders > 0 ? Math.round(stats.todayRevenue / stats.todayOrders) : 0)}</p>
					</div>
				</div>
				<div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1.5">
					<Link to="/admin/finance/reports" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
						<FileBarChart className="h-4 w-4" />
						Unduh Laporan
					</Link>
					<Link to="/admin/finance" className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground transition-all hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
						<Wallet className="h-4 w-4" />
						Transaksi
					</Link>
				</div>
			</div>

		</div>
	);
}

// Compact Stat Card Component
function CompactStat({
	icon,
	label,
	value,
	sub,
	trend,
	color,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	sub?: string;
	trend?: "up" | "down";
	color: "primary" | "green" | "red" | "accent";
}) {
	const iconColors = {
		primary: "text-primary",
		green: "text-emerald-500",
		red: "text-rose-500",
		accent: "text-amber-500",
	};

	const trendColors = {
		up: "bg-emerald-100 text-emerald-700",
		down: "bg-rose-100 text-rose-700",
	};

	return (
		<div className="rounded-xl border border-border bg-card p-2.5 group hover:bg-muted/30 transition-colors">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/50 ${iconColors[color]}`}>
						{icon}
					</div>
					<span className="text-[10px] font-semibold text-muted-foreground truncate">{label}</span>
				</div>
				{trend && (
					<span className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-bold ${trendColors[trend]}`}>
						{trend === "up" ? <ArrowUpRight className="w-2 h-2" /> : <ArrowDownRight className="w-2 h-2" />}
						{trend === "up" ? "Gain" : "Loss"}
					</span>
				)}
			</div>
			<p className="mt-0.5 font-bold text-sm tracking-tight text-foreground">{value}</p>
			{sub && (
				<p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{sub}</p>
			)}
		</div>
	);
}

// Compact Status Row Component
function CompactStatusRow({
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
	const barColors = {
		yellow: "bg-amber-500",
		blue: "bg-indigo-500",
		green: "bg-emerald-500",
		red: "bg-rose-500",
	};

	const iconColors = {
		yellow: "text-amber-600 bg-amber-500/10",
		blue: "text-indigo-600 bg-indigo-500/10",
		green: "text-emerald-600 bg-emerald-500/10",
		red: "text-rose-600 bg-rose-500/10",
	};

	const percentage = Math.min((count / (total || 1)) * 100, 100);

	return (
		<div className="flex items-center gap-2">
			<div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconColors[color]}`}>
				{icon}
			</div>
			<div className="flex-1">
				<div className="flex items-center justify-between mb-0.5">
					<span className="text-[10px] font-semibold text-foreground">{label}</span>
					<span className="text-[11px] font-bold text-foreground bg-muted px-1 py-0.5 rounded">{count}</span>
				</div>
				<div className="h-1.5 rounded-full bg-muted overflow-hidden">
					<div className={`h-full rounded-full ${barColors[color]}`} style={{ width: `${percentage}%` }} />
				</div>
			</div>
		</div>
	);
}
