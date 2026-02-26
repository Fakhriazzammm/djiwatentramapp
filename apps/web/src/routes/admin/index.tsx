import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import {
	AlertTriangle,
	ArrowRight,
	Calculator,
	DollarSign,
	Percent,
	RefreshCcw,
	ShoppingBag,
	TrendingDown,
	TrendingUp,
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

function DashboardPage() {
	// ... (rest of DashboardPage remains the same, assuming it doesn't use React.xxx)
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
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-6 duration-500">
			{/* Stats Grid */}
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={<DollarSign className="text-primary" />}
					loading={!orders}
					title="Total Pendapatan"
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
					title="Total Pesanan"
					trend="+5 baru hari ini"
					value={totalOrders.toString()}
				/>
				<StatCard
					alert
					icon={<AlertTriangle className="text-destructive" />}
					loading={!orders}
					title="Pesanan Tertunda"
					trend="Perlu tindakan"
					value={pendingOrders.toString()}
				/>
				<StatCard
					icon={<TrendingUp className="text-primary" />}
					loading={!orders}
					title="Rata-rata Pesanan"
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
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
					<StatCard
						icon={<Calculator className="text-primary" />}
						loading={!hppDashboard}
						title="HPP Terhitung"
						value={`${hppDashboard.totalCalculations} Produk`}
						trend={`Rata-rata margin ${hppDashboard.avgMargin.toFixed(1)}%`}
					/>
					<StatCard
						icon={<Percent className="text-primary" />}
						loading={!hppCogs}
						title="Laba Kotor"
						value={
							hppCogs
								? new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(hppCogs.totalProfit)
								: "Rp 0"
						}
						trend={
							hppCogs
								? `Margin ${hppCogs.grossMargin.toFixed(1)}% dari ${hppCogs.matchedOrders} pesanan`
								: undefined
						}
					/>
					<StatCard
						icon={<TrendingUp className="text-primary" />}
						loading={!hppForecast}
						title="Prediksi Biaya 30 Hari"
						value={
							hppForecast
								? new Intl.NumberFormat("id-ID", {
										style: "currency",
										currency: "IDR",
										maximumFractionDigits: 0,
									}).format(hppForecast.totalForecastCost)
								: "Rp 0"
						}
						trend={
							hppForecast
								? `Berdasarkan ${hppForecast.daysWithData} hari data`
								: undefined
						}
					/>
					<StatCard
						alert={
							(hppDashboard.lowMarginAlerts.length) > 0
						}
						icon={
							hppDashboard.lowMarginAlerts.length > 0 ? (
								<TrendingDown className="text-destructive" />
							) : (
								<TrendingUp className="text-primary" />
							)
						}
						loading={!hppDashboard}
						title="Margin Rendah"
						value={
							hppDashboard.lowMarginAlerts.length > 0
								? `${hppDashboard.lowMarginAlerts.length} Produk`
								: "Semua Aman"
						}
						trend={
							hppDashboard.lowMarginAlerts.length > 0
								? `Terendah: ${hppDashboard.lowMarginAlerts[0]?.marginPercent.toFixed(1)}%`
								: "Semua margin di atas 20%"
						}
					/>
				</div>
			)}

			{/* HPP Rankings & Alerts */}
			{hppDashboard && hppDashboard.totalCalculations > 0 && (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					{/* Top Profit Products */}
					<div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="flex items-center gap-2 font-bold text-base text-foreground">
								<TrendingUp className="h-4 w-4 text-green-500" />
								Produk Paling Untung
							</h3>
							<Link
								className="flex items-center gap-1 text-primary text-xs hover:underline"
								to="/admin/hpp-calculator"
							>
								Lihat HPP
								<ArrowRight className="h-3 w-3" />
							</Link>
						</div>
						<div className="space-y-2">
							{hppDashboard.topProfit.map((item, i) => (
								<div
									className="flex items-center justify-between rounded-lg border border-border/50 p-2 text-sm"
									key={item.id}
								>
									<div className="flex items-center gap-2">
										<span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 font-bold text-green-700 text-[10px] dark:bg-green-900/30">
											{i + 1}
										</span>
										<span className="font-medium text-xs">
											{item.name}
										</span>
									</div>
									<div className="flex items-center gap-3 text-xs">
										<span className="font-bold text-green-600 dark:text-green-400">
											{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(item.profitPerServing)}
										</span>
										<span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400">
											{item.marginPercent.toFixed(1)}%
										</span>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Low Margin Alerts + Forecast */}
					<div className="space-y-4">
						{/* Low Margin Alerts */}
						{hppDashboard.lowMarginAlerts.length > 0 && (
							<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
								<h3 className="mb-2 flex items-center gap-2 font-bold text-amber-800 text-sm dark:text-amber-200">
									<AlertTriangle className="h-4 w-4" />
									Peringatan Margin Rendah (&lt;20%)
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
												Margin {item.marginPercent.toFixed(1)}%
											</span>
										</div>
									))}
								</div>
							</div>
						)}

						{/* Forecast */}
						{hppForecast &&
							hppForecast.ingredients.length > 0 && (
								<div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
									<h3 className="mb-2 flex items-center gap-2 font-bold text-base text-foreground">
										<Calculator className="h-4 w-4 text-primary" />
										Prediksi Biaya Bahan 30 Hari
									</h3>
									<div className="space-y-1.5">
										{hppForecast.ingredients.slice(0, 5).map((item) => (
											<div
												className="flex items-center justify-between text-xs"
												key={item.ingredientName}
											>
												<span className="text-muted-foreground">
													{item.ingredientName}{" "}
													<span className="text-[10px]">
														(~{new Intl.NumberFormat("id-ID", {
															maximumFractionDigits: 0,
														}).format(item.forecastUsage)}{" "}
														{item.unit})
													</span>
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
											<span>Total Estimasi</span>
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

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				{/* Recent Orders */}
				<div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm lg:col-span-2">
					<h3 className="mb-3 font-bold text-base text-foreground">
						Pesanan Terbaru
					</h3>
					<div className="overflow-x-auto">
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
				<div className="space-y-4">
					<div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
						<div className="absolute top-0 right-0 p-4 opacity-5">
							<TrendingUp className="h-24 w-24" />
						</div>
						<div className="mb-3 flex items-center justify-between">
							<h3 className="flex items-center gap-2 font-bold text-base text-foreground">
								✨ Yumi AI Business Analyst
							</h3>
							<button
								className="rounded-full bg-secondary p-1.5 transition-colors hover:bg-accent disabled:opacity-50"
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
							<div className="whitespace-pre-line font-medium text-foreground/80 text-sm leading-relaxed">
								{insight}
							</div>
						) : (
							<div className="text-muted-foreground text-sm">
								Klik refresh untuk meminta Yumi menganalisis performa bisnis
								Anda.
							</div>
						)}
					</div>

					{/* Stock Alerts */}
					<div className="rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
						<div className="mb-2 flex items-center justify-between">
							<h3 className="font-bold text-base text-foreground">
								⚠️ Peringatan Stok
							</h3>
							<button
								className="rounded-full bg-secondary p-1.5 transition-colors hover:bg-accent disabled:opacity-50"
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
										className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2 text-destructive text-sm"
										key={item._id}
									>
										<AlertTriangle className="h-4 w-4 shrink-0" />
										<div className="flex-1">
											<div className="font-bold">
												Stok Rendah: {item.ingredientName}
											</div>
											<div className="text-xs opacity-80">
												Tersisa {item.quantity} {item.unit}
											</div>
										</div>
									</div>
								))
							) : (
								<div className="text-muted-foreground text-sm">
									✅ Semua stok aman
								</div>
							)}
							{stockPrediction && (
								<div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-700 text-xs">
									<div className="mb-1 font-bold">🤖 Prediksi AI:</div>
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
			className={`flex flex-col justify-between rounded-xl border p-4 ${alert ? "border-destructive/30 bg-destructive/5" : "border-border/50 bg-card/50"} backdrop-blur-sm`}
		>
			<div className="mb-2 flex items-start justify-between">
				<div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					{title}
				</div>
				<div
					className={`rounded-full p-1.5 ${alert ? "bg-white" : "bg-background"}`}
				>
					{isValidElement(icon)
						? cloneElement(icon as ReactElement<{ className?: string }>, {
								className: `h-4 w-4 ${alert ? "text-destructive" : "text-primary"}`,
							})
						: icon}
				</div>
			</div>
			<div>
				{loading ? (
					<div className="h-8 w-24 animate-pulse rounded bg-muted/50" />
				) : (
					<div className="font-bold text-2xl text-foreground tracking-tight">
						{value}
					</div>
				)}
				{trend && !loading && (
					<div className="mt-1 font-medium text-muted-foreground text-xs">
						{trend}
					</div>
				)}
			</div>
		</div>
	);
}
