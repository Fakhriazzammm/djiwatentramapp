import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import {
	AlertTriangle,
	Archive,
	ArrowRight,
	Calculator,
	ClipboardList,
	DollarSign,
	Package,
	Percent,
	RefreshCcw,
	ShoppingBag,
	Sparkles,
	TrendingDown,
	TrendingUp,
	Wallet,
} from "lucide-react";
import {
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
	component: DashboardPage,
});

// Quick access shortcuts for mobile dashboard
const QUICK_SHORTCUTS = [
	{
		to: "/admin/orders",
		icon: ClipboardList,
		label: "Pesanan",
		color: "bg-blue-500",
	},
	{
		to: "/admin/products",
		icon: Package,
		label: "Produk",
		color: "bg-emerald-500",
	},
	{
		to: "/admin/inventory",
		icon: Archive,
		label: "Stok",
		color: "bg-orange-500",
	},
	{
		to: "/admin/finance",
		icon: Wallet,
		label: "Keuangan",
		color: "bg-violet-500",
	},
	{
		to: "/admin/discounts",
		icon: Percent,
		label: "Promosi",
		color: "bg-pink-500",
	},
	{
		to: "/admin/hpp-calculator",
		icon: Calculator,
		label: "HPP",
		color: "bg-cyan-500",
	},
	{
		to: "/admin/ai-chat",
		icon: Sparkles,
		label: "AI Chat",
		color: "bg-amber-500",
	},
	{
		to: "/admin/forecasting",
		icon: TrendingUp,
		label: "Prediksi",
		color: "bg-teal-500",
	},
];

function DashboardPage() {
	const orders = useQuery(api.orders.getOrders, {});
	const inventory = useQuery(api.inventory.getInventory);
	const hppDashboard = useQuery(api.hpp.getHppDashboardData);
	const hppCogs = useQuery(api.hpp.getOrdersCogs);
	const hppForecast = useQuery(api.hpp.getHppForecast, { days: 30 });
	const generateCompanyOverview = useAction(api.ai.generateCompanyOverview);
	const predictStockOut = useAction(api.ai.predictStockOut);
	const [insight, setInsight] = useState<string | null>(null);
	const [stockPrediction, setStockPrediction] = useState<string | null>(null);
	const [loadingInsight, setLoadingInsight] = useState(false);
	const [loadingStockPrediction, setLoadingStockPrediction] = useState(false);
	const hasFetchedInsight = useRef(false);

	const fetchInsight = useCallback(async () => {
		if (!(orders && inventory)) {
			return;
		}
		setLoadingInsight(true);
		try {
			const totalIncome = orders
				.filter((o) => o.status === "completed" || o.status === "paid")
				.reduce((acc, o) => acc + o.totalAmount, 0);

			const financeSummary = JSON.stringify({
				income: totalIncome,
				expense: 0,
				balance: totalIncome,
			});

			const inventorySummary = JSON.stringify({
				totalItems: inventory.length,
				lowStockCount: inventory.filter(
					(i) => i.quantity <= i.lowStockThreshold
				).length,
				lowStockNames: inventory
					.filter((i) => i.quantity <= i.lowStockThreshold)
					.map((i) => i.ingredientName),
			});

			const ordersSummary = JSON.stringify({
				totalOrders: orders.length,
				totalSales: totalIncome,
			});

			const result = await generateCompanyOverview({
				financeSummary,
				inventorySummary,
				ordersSummary,
			});
			setInsight(result);
		} catch (e) {
			console.error(e);
			toast.error("Gagal membuat analisis Yumi");
		} finally {
			setLoadingInsight(false);
		}
	}, [orders, inventory, generateCompanyOverview]);

	// Auto-fetch AI analysis on mount when data is available
	useEffect(() => {
		if (orders && inventory && !hasFetchedInsight.current && !insight) {
			hasFetchedInsight.current = true;
			fetchInsight();
		}
	}, [orders, inventory, insight, fetchInsight]);

	const lowStockItems =
		inventory?.filter((item) => item.quantity <= item.lowStockThreshold) || [];

	const totalSales =
		orders?.reduce(
			(acc, order) =>
				acc +
				(order.status === "completed" || order.status === "paid"
					? order.totalAmount
					: 0),
			0
		) || 0;
	const totalOrders = orders?.length || 0;
	const pendingOrders =
		orders?.filter((o) => o.status === "pending").length || 0;

	return (
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-4 duration-500 md:space-y-6">
			{/* === MOBILE QUICK SHORTCUTS (horizontal scroll) === */}
			<div className="md:hidden">
				<div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
					{QUICK_SHORTCUTS.map((item) => (
						<Link
							className="flex shrink-0 flex-col items-center gap-1.5"
							key={item.to}
							to={item.to}
						>
							<div
								className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.color} text-white shadow-sm transition-transform active:scale-95`}
							>
								<item.icon className="h-5 w-5" />
							</div>
							<span className="font-medium text-[10px] text-muted-foreground">
								{item.label}
							</span>
						</Link>
					))}
				</div>
			</div>

			{/* Stats Grid - 2 cols on mobile, 4 on desktop */}
			<div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
				<StatCard
					icon={<DollarSign className="text-primary" />}
					loading={!orders}
					title="Pendapatan"
					trend="+12% dari kemarin"
					value={new Intl.NumberFormat("id-ID", {
						style: "currency",
						currency: "IDR",
						maximumFractionDigits: 0,
					}).format(totalSales)}
				/>
				<StatCard
					icon={<ShoppingBag className="text-primary" />}
					loading={!orders}
					title="Pesanan"
					trend="+5 baru"
					value={totalOrders.toString()}
				/>
				<StatCard
					alert
					icon={<AlertTriangle className="text-destructive" />}
					loading={!orders}
					title="Tertunda"
					trend="Perlu tindakan"
					value={pendingOrders.toString()}
				/>
				<StatCard
					icon={<TrendingUp className="text-primary" />}
					loading={!orders}
					title="Rata-rata"
					value={
						totalOrders > 0
							? new Intl.NumberFormat("id-ID", {
									style: "currency",
									currency: "IDR",
									maximumFractionDigits: 0,
								}).format(totalSales / totalOrders)
							: "Rp 0"
					}
				/>
			</div>

			{/* HPP Dashboard Section */}
			{hppDashboard && hppDashboard.totalCalculations > 0 && (
				<div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
					<StatCard
						icon={<Calculator className="text-primary" />}
						loading={!hppDashboard}
						title="HPP"
						trend={`Margin ${hppDashboard.avgMargin.toFixed(1)}%`}
						value={`${hppDashboard.totalCalculations} Produk`}
					/>
					<StatCard
						icon={<Percent className="text-primary" />}
						loading={!hppCogs}
						title="Laba Kotor"
						trend={hppCogs ? `${hppCogs.grossMargin.toFixed(1)}%` : undefined}
						value={
							hppCogs
								? new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(hppCogs.totalProfit)
								: "Rp 0"
						}
					/>
					<StatCard
						icon={<TrendingUp className="text-primary" />}
						loading={!hppForecast}
						title="Prediksi 30H"
						trend={
							hppForecast ? `${hppForecast.daysWithData} hari data` : undefined
						}
						value={
							hppForecast
								? new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(hppForecast.totalForecastCost)
								: "Rp 0"
						}
					/>
					<StatCard
						alert={hppDashboard.lowMarginAlerts.length > 0}
						icon={
							hppDashboard.lowMarginAlerts.length > 0 ? (
								<TrendingDown className="text-destructive" />
							) : (
								<TrendingUp className="text-primary" />
							)
						}
						loading={!hppDashboard}
						title="Margin"
						trend={
							hppDashboard.lowMarginAlerts.length > 0
								? `Min: ${hppDashboard.lowMarginAlerts[0]?.marginPercent.toFixed(1)}%`
								: "Semua > 20%"
						}
						value={
							hppDashboard.lowMarginAlerts.length > 0
								? `${hppDashboard.lowMarginAlerts.length} Rendah`
								: "Aman"
						}
					/>
				</div>
			)}

			{/* HPP Rankings & Alerts */}
			{hppDashboard && hppDashboard.totalCalculations > 0 && (
				<div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-2">
					{/* Top Profit Products */}
					<div className="rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-sm md:p-4">
						<div className="mb-2 flex items-center justify-between md:mb-3">
							<h3 className="flex items-center gap-2 font-bold text-foreground text-sm md:text-base">
								<TrendingUp className="h-4 w-4 text-green-500" />
								Produk Paling Untung
							</h3>
							<Link
								className="flex items-center gap-1 text-primary text-xs hover:underline"
								to="/admin/hpp-calculator"
							>
								Lihat
								<ArrowRight className="h-3 w-3" />
							</Link>
						</div>
						<div className="space-y-1.5 md:space-y-2">
							{hppDashboard.topProfit.map((item, i) => (
								<div
									className="flex items-center justify-between rounded-lg border border-border/50 p-2 text-sm"
									key={item.id}
								>
									<div className="flex items-center gap-2">
										<span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 font-bold text-[10px] text-green-700 dark:bg-green-900/30">
											{i + 1}
										</span>
										<span className="font-medium text-xs">{item.name}</span>
									</div>
									<div className="flex items-center gap-2 text-xs md:gap-3">
										<span className="font-bold text-green-600 dark:text-green-400">
											{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(item.profitPerServing)}
										</span>
										<span className="hidden rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 sm:inline dark:bg-green-900/30 dark:text-green-400">
											{item.marginPercent.toFixed(1)}%
										</span>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Low Margin Alerts + Forecast */}
					<div className="space-y-3 md:space-y-4">
						{/* Low Margin Alerts */}
						{hppDashboard.lowMarginAlerts.length > 0 && (
							<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:p-4 dark:border-amber-800 dark:bg-amber-950/30">
								<h3 className="mb-2 flex items-center gap-2 font-bold text-amber-800 text-xs md:text-sm dark:text-amber-200">
									<AlertTriangle className="h-4 w-4" />
									Margin Rendah (&lt;20%)
								</h3>
								<div className="space-y-1.5">
									{hppDashboard.lowMarginAlerts.slice(0, 5).map((item) => (
										<div
											className="flex items-center justify-between text-xs"
											key={item.id}
										>
											<span className="text-amber-700 dark:text-amber-300">
												{item.name}
											</span>
											<span className="font-bold text-amber-800 dark:text-amber-200">
												{item.marginPercent.toFixed(1)}%
											</span>
										</div>
									))}
								</div>
							</div>
						)}

						{/* Forecast */}
						{hppForecast && hppForecast.ingredients.length > 0 && (
							<div className="rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-sm md:p-4">
								<h3 className="mb-2 flex items-center gap-2 font-bold text-foreground text-sm md:text-base">
									<Calculator className="h-4 w-4 text-primary" />
									Biaya Bahan 30 Hari
								</h3>
								<div className="space-y-1.5">
									{hppForecast.ingredients.slice(0, 5).map((item) => (
										<div
											className="flex items-center justify-between text-xs"
											key={item.ingredientName}
										>
											<span className="text-muted-foreground">
												{item.ingredientName}
											</span>
											<span className="font-medium">
												{new Intl.NumberFormat("id-ID", {
													style: "currency",
													currency: "IDR",
													maximumFractionDigits: 0,
												}).format(item.forecastCost)}
											</span>
										</div>
									))}
									<div className="mt-1 flex items-center justify-between border-border border-t pt-1 font-bold text-xs">
										<span>Total</span>
										<span className="text-primary">
											{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(hppForecast.totalForecastCost)}
										</span>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Recent Orders + AI Insights */}
			<div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-3">
				{/* Recent Orders - Card-based on mobile, Table on desktop */}
				<div className="rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-sm md:p-4 lg:col-span-2">
					<div className="mb-2 flex items-center justify-between md:mb-3">
						<h3 className="font-bold text-foreground text-sm md:text-base">
							Pesanan Terbaru
						</h3>
						<Link
							className="flex items-center gap-1 text-primary text-xs hover:underline"
							to="/admin/orders"
						>
							Semua
							<ArrowRight className="h-3 w-3" />
						</Link>
					</div>

					{/* Mobile: Card-based order list */}
					<div className="space-y-2 md:hidden">
						{!orders &&
							[1, 2, 3].map((i) => (
								<div
									className="animate-pulse rounded-lg border border-border/50 p-3"
									key={i}
								>
									<div className="flex items-center justify-between">
										<div className="h-4 w-16 rounded bg-muted/50" />
										<div className="h-4 w-20 rounded bg-muted/50" />
									</div>
									<div className="mt-2 h-3 w-24 rounded bg-muted/50" />
								</div>
							))}
						{orders &&
							orders.length > 0 &&
							orders.slice(0, 5).map((order) => {
								let statusClass = "bg-blue-100 text-blue-700";
								let statusText = "Dibayar";
								if (order.status === "completed") {
									statusClass = "bg-green-100 text-green-700";
									statusText = "Selesai";
								} else if (order.status === "pending") {
									statusClass = "bg-yellow-100 text-yellow-700";
									statusText = "Tertunda";
								} else if (order.status === "cancelled") {
									statusClass = "bg-red-100 text-red-700";
									statusText = "Dibatalkan";
								}
								return (
									<div
										className="flex items-center justify-between rounded-lg border border-border/50 p-3 transition-colors active:bg-muted/50"
										key={order._id}
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="font-bold text-foreground text-xs">
													#{order.orderNumber}
												</span>
												<span
													className={`rounded-full px-1.5 py-0.5 font-bold text-[9px] ${statusClass}`}
												>
													{statusText}
												</span>
											</div>
											<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
												{order.customerName || "Tamu"} &middot;{" "}
												{new Date(order._creationTime).toLocaleTimeString(
													"id-ID",
													{ hour: "2-digit", minute: "2-digit" }
												)}
											</p>
										</div>
										<span className="ml-2 shrink-0 font-bold text-primary text-sm">
											{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(order.totalAmount)}
										</span>
									</div>
								);
							})}
						{orders && orders.length === 0 && (
							<p className="py-6 text-center text-muted-foreground text-sm">
								Belum ada pesanan
							</p>
						)}
					</div>

					{/* Desktop: Table view */}
					<div className="hidden overflow-x-auto md:block">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-border border-b text-left text-muted-foreground/70">
									<th className="pb-2 pl-2 font-medium text-xs uppercase tracking-wider">
										ID
									</th>
									<th className="pb-2 font-medium text-xs uppercase tracking-wider">
										Pelanggan
									</th>
									<th className="pb-2 font-medium text-xs uppercase tracking-wider">
										Total
									</th>
									<th className="pb-2 font-medium text-xs uppercase tracking-wider">
										Status
									</th>
									<th className="pb-2 font-medium text-xs uppercase tracking-wider">
										Waktu
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/50">
								{!orders &&
									["sk1", "sk2", "sk3", "sk4", "sk5"].map((skId, i) => (
										<tr
											animation-delay={i * 100}
											className="animate-pulse"
											key={skId}
										>
											<td className="py-2.5 pl-2">
												<div className="h-4 w-12 rounded bg-muted/50" />
											</td>
											<td className="py-2.5">
												<div className="h-4 w-24 rounded bg-muted/50" />
											</td>
											<td className="py-2.5">
												<div className="h-4 w-20 rounded bg-muted/50" />
											</td>
											<td className="py-2.5">
												<div className="h-4 w-16 rounded-full bg-muted/50" />
											</td>
											<td className="py-2.5 pr-2 text-right">
												<div className="ml-auto h-4 w-12 rounded bg-muted/50" />
											</td>
										</tr>
									))}

								{orders &&
									orders.length > 0 &&
									orders.slice(0, 5).map((order) => {
										let statusClass = "bg-blue-100 text-blue-700";
										let statusText = "Dibayar";

										if (order.status === "completed") {
											statusClass = "bg-green-100 text-green-700";
											statusText = "Selesai";
										} else if (order.status === "pending") {
											statusClass = "bg-yellow-100 text-yellow-700";
											statusText = "Tertunda";
										} else if (order.status === "cancelled") {
											statusClass = "bg-red-100 text-red-700";
											statusText = "Dibatalkan";
										}

										return (
											<tr
												className="group transition-colors hover:bg-muted/50"
												key={order._id}
											>
												<td className="py-2.5 pl-2 font-medium text-foreground">
													{order.orderNumber}
												</td>
												<td className="py-2.5 text-foreground/80">
													{order.customerName || "Tamu"}
												</td>
												<td className="py-2.5 font-bold text-primary">
													{new Intl.NumberFormat("id-ID", {
														style: "currency",
														currency: "IDR",
														maximumFractionDigits: 0,
													}).format(order.totalAmount)}
												</td>
												<td className="py-2.5">
													<span
														className={`rounded-full px-2 py-0.5 font-bold text-[10px] capitalize ${statusClass}`}
													>
														{statusText}
													</span>
												</td>
												<td className="py-2.5 text-muted-foreground text-xs">
													{new Date(order._creationTime).toLocaleTimeString(
														"id-ID"
													)}
												</td>
											</tr>
										);
									})}

								{orders && orders.length === 0 && (
									<tr>
										<td
											className="py-8 text-center text-muted-foreground"
											colSpan={5}
										>
											Belum ada pesanan
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>

				{/* AI Insights & Stock Alerts */}
				<div className="space-y-3 md:space-y-4">
					<div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-sm md:p-4">
						<div className="absolute top-0 right-0 p-4 opacity-5">
							<TrendingUp className="h-24 w-24" />
						</div>
						<div className="mb-2 flex items-center justify-between md:mb-3">
							<h3 className="flex items-center gap-2 font-bold text-foreground text-sm md:text-base">
								<Sparkles className="h-4 w-4 text-amber-500" />
								Yumi AI
							</h3>
							<button
								className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-accent disabled:opacity-50"
								disabled={loadingInsight}
								onClick={fetchInsight}
								type="button"
							>
								<RefreshCcw
									className={`h-3.5 w-3.5 ${loadingInsight ? "animate-spin" : ""}`}
								/>
							</button>
						</div>

						{insight ? (
							<div className="whitespace-pre-line font-medium text-foreground/80 text-xs leading-relaxed md:text-sm">
								{insight}
							</div>
						) : (
							<div className="text-muted-foreground text-xs md:text-sm">
								Klik refresh untuk analisis bisnis AI.
							</div>
						)}
					</div>

					{/* Stock Alerts */}
					<div className="rounded-xl border border-border/50 bg-card/50 p-3 backdrop-blur-sm md:p-4">
						<div className="mb-2 flex items-center justify-between">
							<h3 className="font-bold text-foreground text-sm md:text-base">
								Peringatan Stok
							</h3>
							<button
								className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-accent disabled:opacity-50"
								disabled={loadingStockPrediction || !inventory}
								onClick={async () => {
									if (!(inventory && orders)) {
										return;
									}
									setLoadingStockPrediction(true);
									try {
										const inventoryData = JSON.stringify(
											inventory.map((i) => ({
												name: i.ingredientName,
												qty: i.quantity,
												unit: i.unit,
												threshold: i.lowStockThreshold,
											}))
										);
										const salesTrend = JSON.stringify(
											orders.slice(0, 20).map((o) => ({
												date: o._creationTime,
												items: o.items.length,
											}))
										);
										const result = await predictStockOut({
											inventoryData,
											recentSalesTrend: salesTrend,
										});
										setStockPrediction(result);
									} catch {
										toast.error("Gagal prediksi stok");
									} finally {
										setLoadingStockPrediction(false);
									}
								}}
								title="Prediksi AI"
								type="button"
							>
								<RefreshCcw
									className={`h-3.5 w-3.5 ${loadingStockPrediction ? "animate-spin" : ""}`}
								/>
							</button>
						</div>
						<div className="space-y-2">
							{lowStockItems.length > 0 ? (
								lowStockItems.slice(0, 3).map((item) => (
									<div
										className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-destructive text-xs md:gap-3 md:text-sm"
										key={item._id}
									>
										<AlertTriangle className="h-4 w-4 shrink-0" />
										<div className="min-w-0 flex-1">
											<div className="truncate font-bold">
												{item.ingredientName}
											</div>
											<div className="text-[10px] opacity-80 md:text-xs">
												Sisa {item.quantity} {item.unit}
											</div>
										</div>
									</div>
								))
							) : (
								<div className="text-muted-foreground text-xs md:text-sm">
									Semua stok aman
								</div>
							)}
							{stockPrediction && (
								<div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-700 md:mt-3 md:p-3 md:text-xs">
									<div className="mb-1 font-bold">Prediksi AI:</div>
									<div className="whitespace-pre-line">{stockPrediction}</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function StatCard({
	title,
	value,
	icon,
	trend,
	alert,
	loading,
}: {
	title: string;
	value: string;
	icon: ReactNode;
	trend?: string;
	alert?: boolean;
	loading?: boolean;
}) {
	return (
		<div
			className={`flex flex-col justify-between rounded-xl border p-3 md:p-4 ${alert ? "border-destructive/30 bg-destructive/5" : "border-border/50 bg-card/50"} backdrop-blur-sm`}
		>
			<div className="mb-1.5 flex items-start justify-between md:mb-2">
				<div className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide md:text-xs">
					{title}
				</div>
				<div
					className={`rounded-full p-1 md:p-1.5 ${alert ? "bg-white" : "bg-background"}`}
				>
					{isValidElement(icon)
						? cloneElement(icon as ReactElement<{ className?: string }>, {
								className: `h-3.5 w-3.5 md:h-4 md:w-4 ${alert ? "text-destructive" : "text-primary"}`,
							})
						: icon}
				</div>
			</div>
			<div>
				{loading ? (
					<div className="h-6 w-16 animate-pulse rounded bg-muted/50 md:h-8 md:w-24" />
				) : (
					<div className="font-bold text-foreground text-lg tracking-tight md:text-2xl">
						{value}
					</div>
				)}
				{trend && !loading && (
					<div className="mt-0.5 font-medium text-[10px] text-muted-foreground md:mt-1 md:text-xs">
						{trend}
					</div>
				)}
			</div>
		</div>
	);
}
