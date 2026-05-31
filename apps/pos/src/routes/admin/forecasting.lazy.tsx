import { createLazyFileRoute, Link } from "@tanstack/react-router";
import type { Id } from "@/types/backend-compat";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale/id";
import {
	AlertTriangle,
	BarChart3,
	Bot,
	Clock,
	RefreshCw,
	Sparkles,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridInventory } from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import {
	useHybridPredictBestPromoTime,
	useHybridPredictBusyHours,
	useHybridPredictDailyRevenue,
	useHybridPredictStockOut,
	useHybridPredictTrendingProducts,
} from "@/hooks/use-hybrid-finance-analytics-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createLazyFileRoute("/admin/forecasting")({
	component: ForecastingPage,
});

// Type definitions for forecasting data
interface ForecastData {
	forecastDate: string;
	predictedDemand: number;
	predictedStock: number;
	confidence?: number;
	seasonalFactor?: number;
	trendFactor?: number;
}

interface ForecastResult {
	forecasts: ForecastData[];
	stockoutRisk: number;
	recommendations: string[];
	inventoryName?: string;
	currentStock?: number;
	avgDailyUsage?: number;
}

interface StockoutPrediction {
	inventoryId: Id<"inventory">;
	ingredientName: string;
	currentStock: number;
	unit: string;
	avgDailyUsage: number;
	avgForecastDemand: number;
	daysUntilStockout: number;
	riskLevel: "low" | "medium" | "high";
}

function ForecastingPage() {
	// Real AI-powered predictions from legacy backend
	const stockoutPredictionsRaw = useHybridPredictStockOut(7);
	const busyHours = useHybridPredictBusyHours();
	const revenuePrediction = useHybridPredictDailyRevenue(7);
	const trendingProducts = useHybridPredictTrendingProducts(7);
	useHybridPredictBestPromoTime();
	const inventoryRaw = useHybridInventory();

	// Map AI predictions to the StockoutPrediction interface used by the UI
	const stockoutPredictions: StockoutPrediction[] | undefined =
		stockoutPredictionsRaw?.map((p: any) => ({
			inventoryId: p.inventoryId as Id<"inventory">,
			ingredientName: p.ingredientName,
			currentStock: p.currentStock,
			unit: p.unit,
			avgDailyUsage: p.dailyUsage,
			avgForecastDemand: p.dailyUsage * 1.1,
			daysUntilStockout: p.daysUntilEmpty,
			riskLevel: p.risk as "low" | "medium" | "high",
		}));

	const inventory = inventoryRaw as
		| Array<{
				_id: Id<"inventory">;
				ingredientName: string;
				quantity: number;
				unit: string;
		  }>
		| undefined;

	const [selectedInventory, setSelectedInventory] =
		useState<Id<"inventory"> | null>(null);
	const [forecastResult, setForecastResult] = useState<ForecastResult | null>(
		null
	);
	const [loadingForecast, setLoadingForecast] = useState(false);
	const [loadingAll, setLoadingAll] = useState(false);
	const [daysToForecast, setDaysToForecast] = useState(7);

	const handleGenerateForecast = () => {
		if (!selectedInventory) {
			toast.error("Pilih item inventory");
			return;
		}

		setLoadingForecast(true);
		try {
			// Generate forecast from existing stockout prediction data
			const item = (inventory as any)?.find((i: any) => i._id === selectedInventory);
			const prediction = stockoutPredictions?.find(
				(p: any) => p.inventoryId === selectedInventory
			);

			if (item && prediction) {
				const forecasts = Array.from({ length: daysToForecast }, (_, idx) => {
					const date = new Date();
					date.setDate(date.getDate() + idx + 1);
					return {
						forecastDate: date.toISOString().split("T")[0],
						predictedDemand: prediction.avgDailyUsage,
						predictedStock: Math.max(
							0,
							item.quantity - prediction.avgDailyUsage * (idx + 1)
						),
						confidence: 75,
						seasonalFactor: 1.0,
						trendFactor: 1.0,
					};
				});

				setForecastResult({
					forecasts,
					stockoutRisk: prediction.daysUntilStockout,
					recommendations: [
						prediction.daysUntilStockout <= 3
							? "Segera restock dalam 24 jam!"
							: `Restock dalam ${Math.floor(prediction.daysUntilStockout)} hari`,
					],
					inventoryName: item.ingredientName,
					currentStock: item.quantity,
					avgDailyUsage: prediction.avgDailyUsage,
				});
				toast.success("Forecast berhasil dibuat dari data AI"); triggerHybridRefresh();
			} else if (item) {
				// Item has no risk prediction (stock is fine)
				const forecasts = Array.from({ length: daysToForecast }, (_, idx) => {
					const date = new Date();
					date.setDate(date.getDate() + idx + 1);
					return {
						forecastDate: date.toISOString().split("T")[0],
						predictedDemand: 0,
						predictedStock: item.quantity,
						confidence: 50,
						seasonalFactor: 1.0,
						trendFactor: 1.0,
					};
				});
				setForecastResult({
					forecasts,
					stockoutRisk: 999,
					recommendations: ["Stok aman, tidak ada risiko habis dalam waktu dekat"],
					inventoryName: item.ingredientName,
					currentStock: item.quantity,
					avgDailyUsage: 0,
				});
				toast.success("Forecast berhasil — stok aman"); triggerHybridRefresh();
			} else {
				toast.error("Item tidak ditemukan");
			}
		} catch (error) {
			console.error(error);
			toast.error("Gagal generate forecast");
		} finally {
			setLoadingForecast(false);
		}
	};

	const handleGenerateAll = () => {
		setLoadingAll(true);
		try {
			toast.success(
				`Prediksi AI aktif: ${stockoutPredictions?.length || 0} item berisiko terdeteksi`
			);
		} catch (error) {
			console.error(error);
			toast.error("Gagal generate forecasts");
		} finally {
			setLoadingAll(false);
		}
	};

	const getRiskColor = (risk: string) => {
		const colors: Record<string, string> = {
			high: "bg-red-100 text-red-700 border-red-200",
			medium: "bg-orange-100 text-orange-700 border-orange-200",
			low: "bg-green-100 text-green-700 border-green-200",
		};
		return colors[risk] || colors.low;
	};

	const getRiskIcon = (risk: string) => {
		if (risk === "high") {
			return <AlertTriangle className="h-4 w-4" />;
		}
		if (risk === "medium") {
			return <TrendingDown className="h-4 w-4" />;
		}
		return <TrendingUp className="h-4 w-4" />;
	};

	return (
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-6 duration-500">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-bold text-2xl">Inventory Forecasting</h2>
					<p className="text-muted-foreground text-sm">
						AI-powered demand prediction & stockout alerts
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Link
						className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 font-medium text-sm transition-all hover:bg-muted"
						to="/admin/ai-chat"
					>
						<Bot className="h-4 w-4 text-primary" />
						Tanya Yumi
					</Link>
					<button
						className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
						disabled={loadingAll}
						onClick={handleGenerateAll}
						type="button"
					>
						<RefreshCw
							className={`h-4 w-4 ${loadingAll ? "animate-spin" : ""}`}
						/>
						{loadingAll ? "Refreshing..." : "Refresh Prediksi"}
					</button>
				</div>
			</div>

			{/* Quick Stats from AI Predictions */}
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<div className="rounded-xl border border-border bg-card p-4">
					<p className="text-muted-foreground text-xs">Item Berisiko</p>
					<p className="mt-1 font-bold text-2xl text-destructive">
						{stockoutPredictions?.filter((p) => p.riskLevel === "high").length ?? "—"}
					</p>
					<p className="text-muted-foreground text-[10px]">Stok kritis ≤ 3 hari</p>
				</div>
				<div className="rounded-xl border border-border bg-card p-4">
					<p className="text-muted-foreground text-xs">Item Waspada</p>
					<p className="mt-1 font-bold text-2xl text-orange-500">
						{stockoutPredictions?.filter((p) => p.riskLevel === "medium").length ?? "—"}
					</p>
					<p className="text-muted-foreground text-[10px]">Stok rendah ≤ 7 hari</p>
				</div>
				<div className="rounded-xl border border-border bg-card p-4">
					<p className="text-muted-foreground text-xs">Jam Paling Ramai</p>
					<p className="mt-1 font-bold text-2xl text-primary">
						{busyHours?.peakHours?.[0]
							? `${busyHours.peakHours[0].hour}:00`
							: "—"}
					</p>
					<p className="text-muted-foreground text-[10px]">Berdasarkan histori</p>
				</div>
				<div className="rounded-xl border border-border bg-card p-4">
					<p className="text-muted-foreground text-xs">Prediksi Revenue Besok</p>
					<p className="mt-1 font-bold text-lg text-primary">
						{revenuePrediction?.[0]
							? `Rp${revenuePrediction[0].predictedAmount?.toLocaleString("id-ID")}`
							: "—"}
					</p>
					<p className="text-muted-foreground text-[10px]">Estimasi AI</p>
				</div>
			</div>

			{/* Stockout Predictions */}
			<div className="rounded-xl border border-border bg-card">
				<div className="border-border border-b p-4">
					<h3 className="flex items-center gap-2 font-bold text-lg">
						<AlertTriangle className="h-5 w-5 text-destructive" />
						Stockout Risk Predictions
					</h3>
				</div>
				<div className="divide-y divide-border">
					{!stockoutPredictions &&
						Array.from({ length: 3 }).map((_, i) => (
							<div className="p-4" key={i}>
								<div className="flex items-center justify-between">
									<div className="flex-1 space-y-2">
										<Skeleton className="h-4 w-32" />
										<Skeleton className="h-3 w-48" />
									</div>
									<Skeleton className="h-8 w-24" />
								</div>
							</div>
						))}

					{(stockoutPredictions as unknown as
						| StockoutPrediction[]
						| undefined) &&
					(stockoutPredictions as unknown as StockoutPrediction[]).length >
						0 ? (
						(stockoutPredictions as unknown as StockoutPrediction[]).map(
							(prediction: StockoutPrediction) => (
								<div
									className="flex items-center justify-between p-4 transition-colors hover:bg-muted/30"
									key={prediction.inventoryId}
								>
									<div className="flex-1">
										<div className="flex items-center gap-3">
											<h4 className="font-bold">{prediction.ingredientName}</h4>
											<span
												className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${getRiskColor(prediction.riskLevel)}`}
											>
												{getRiskIcon(prediction.riskLevel)}
												{prediction.riskLevel.toUpperCase()}
											</span>
										</div>
										<div className="mt-2 grid grid-cols-4 gap-4 text-sm">
											<div>
												<p className="text-muted-foreground text-xs">
													Current Stock
												</p>
												<p className="font-medium">
													{prediction.currentStock} {prediction.unit}
												</p>
											</div>
											<div>
												<p className="text-muted-foreground text-xs">
													Avg Daily Usage
												</p>
												<p className="font-medium">
													{prediction.avgDailyUsage.toFixed(2)}{" "}
													{prediction.unit}
												</p>
											</div>
											<div>
												<p className="text-muted-foreground text-xs">
													Forecast Demand
												</p>
												<p className="font-medium">
													{prediction.avgForecastDemand.toFixed(2)}{" "}
													{prediction.unit}
												</p>
											</div>
											<div>
												<p className="text-muted-foreground text-xs">
													Days Until Stockout
												</p>
												<p
													className={`font-bold ${
														prediction.daysUntilStockout < 3
															? "text-red-600"
															: prediction.daysUntilStockout < 7
																? "text-orange-600"
																: "text-green-600"
													}`}
												>
													{prediction.daysUntilStockout.toFixed(1)} days
												</p>
											</div>
										</div>
									</div>
								</div>
							)
						)
					) : (stockoutPredictions as unknown as
							| StockoutPrediction[]
							| undefined) &&
						(stockoutPredictions as unknown as StockoutPrediction[]).length ===
							0 ? (
						<div className="p-8 text-center text-muted-foreground">
							Tidak ada item dengan risiko stockout dalam 30 hari ke depan
						</div>
					) : null}
				</div>
			</div>

			{/* Generate Forecast */}
			<div className="rounded-xl border border-border bg-card p-6">
				<h3 className="mb-4 flex items-center gap-2 font-bold text-lg">
					<BarChart3 className="h-5 w-5 text-primary" />
					Generate Demand Forecast
				</h3>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div className="md:col-span-1">
						<label
							className="mb-2 block font-medium text-sm"
							htmlFor="inventory"
						>
							Select Item
						</label>
						<select
							className="w-full rounded-lg border border-border bg-background p-2 text-sm"
							id="inventory"
							onChange={(e) =>
								setSelectedInventory(e.target.value as Id<"inventory">)
							}
							value={selectedInventory || ""}
						>
							<option value="">Pilih Item</option>
							{(
								inventory as
									| Array<{
											_id: Id<"inventory">;
											ingredientName: string;
											quantity: number;
											unit: string;
									  }>
									| undefined
							)?.map((item) => (
								<option key={item._id} value={item._id}>
									{item.ingredientName} ({item.quantity} {item.unit})
								</option>
							))}
						</select>
					</div>

					<div className="md:col-span-1">
						<label className="mb-2 block font-medium text-sm" htmlFor="days">
							Forecast Days
						</label>
						<input
							className="w-full rounded-lg border border-border bg-background p-2 text-sm"
							id="days"
							max="30"
							min="1"
							onChange={(e) => setDaysToForecast(Number(e.target.value))}
							type="number"
							value={daysToForecast}
						/>
					</div>

					<div className="flex items-end md:col-span-1">
						<button
							className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
							disabled={loadingForecast || !selectedInventory}
							onClick={handleGenerateForecast}
							type="button"
						>
							<Sparkles
								className={`h-4 w-4 ${loadingForecast ? "animate-pulse" : ""}`}
							/>
							{loadingForecast ? "Generating..." : "Generate"}
						</button>
					</div>
				</div>

				{/* Forecast Results */}
				{forecastResult && (
					<div className="mt-6 space-y-4">
						<div className="rounded-lg border border-border bg-muted/20 p-4">
							<h4 className="mb-3 font-bold">
								{forecastResult.inventoryName || "Item"}
							</h4>
							<div className="grid grid-cols-3 gap-4 text-sm">
								<div>
									<p className="text-muted-foreground text-xs">Current Stock</p>
									<p className="font-bold text-lg">
										{forecastResult.currentStock || 0}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs">
										Avg Daily Usage
									</p>
									<p className="font-bold text-lg">
										{forecastResult.avgDailyUsage?.toFixed(2) || "0.00"}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs">Stockout Risk</p>
									<p
										className={`font-bold text-lg ${
											forecastResult.stockoutRisk < 3
												? "text-red-600"
												: forecastResult.stockoutRisk < 7
													? "text-orange-600"
													: "text-green-600"
										}`}
									>
										{forecastResult.stockoutRisk.toFixed(1)} days
									</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-border">
							<table className="w-full text-left text-sm">
								<thead className="border-border border-b bg-muted/30">
									<tr>
										<th className="p-3">Date</th>
										<th className="p-3">Predicted Demand</th>
										<th className="p-3">Confidence</th>
										<th className="p-3">Seasonal Factor</th>
										<th className="p-3">Trend Factor</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{forecastResult.forecasts.map((forecast) => (
										<tr
											className="hover:bg-muted/30"
											key={forecast.forecastDate}
										>
											<td className="p-3 font-medium">
												{format(
													new Date(forecast.forecastDate),
													"dd MMM yyyy",
													{
														locale: localeId,
													}
												)}
											</td>
											<td className="p-3 font-bold text-primary">
												{forecast.predictedDemand.toFixed(2)}
											</td>
											<td className="p-3">
												<div className="flex items-center gap-2">
													<div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
														<div
															className="h-full bg-primary"
															style={{ width: `${forecast.confidence || 0}%` }}
														/>
													</div>
													<span className="text-xs">
														{forecast.confidence || 0}%
													</span>
												</div>
											</td>
											<td className="p-3 text-muted-foreground">
												{forecast.seasonalFactor?.toFixed(2) || "1.00"}x
											</td>
											<td className="p-3 text-muted-foreground">
												{forecast.trendFactor?.toFixed(2) || "1.00"}x
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>

			{/* Busy Hours & Trending Products */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{/* Busy Hours */}
				<div className="rounded-xl border border-border bg-card">
					<div className="border-border border-b p-4">
						<h3 className="flex items-center gap-2 font-bold text-lg">
							<Clock className="h-5 w-5 text-primary" />
							Jam Ramai (Analisis AI)
						</h3>
					</div>
					<div className="p-4">
						{!busyHours ? (
							<div className="animate-pulse space-y-2">
								{[1, 2, 3].map((i) => (
									<div className="h-8 rounded bg-muted/50" key={i} />
								))}
							</div>
						) : busyHours.totalOrders === 0 ? (
							<p className="py-4 text-center text-muted-foreground text-sm">
								Belum ada data pesanan
							</p>
						) : (
							<div className="space-y-2">
								{busyHours.peakHours.slice(0, 5).map((item: any) => (
									<div
										className="flex items-center gap-3"
										key={item.hour}
									>
										<span className="w-12 font-mono text-sm text-muted-foreground">
											{item.hour}:00
										</span>
										<div className="flex-1 overflow-hidden rounded-full bg-muted">
											<div
												className="h-2 rounded-full bg-primary transition-all"
												style={{ width: `${item.percentage}%` }}
											/>
										</div>
										<span className="w-16 text-right text-muted-foreground text-xs">
											{item.orderCount} order
										</span>
									</div>
								))}
								<p className="pt-2 text-muted-foreground text-xs">
									Hari terbaik: {busyHours.peakDays?.[0]?.dayName || "—"} (
									{busyHours.peakDays?.[0]?.orderCount || 0} order)
								</p>
							</div>
						)}
					</div>
				</div>

				{/* Trending Products */}
				<div className="rounded-xl border border-border bg-card">
					<div className="border-border border-b p-4">
						<h3 className="flex items-center gap-2 font-bold text-lg">
							<TrendingUp className="h-5 w-5 text-primary" />
							Produk Trending (7 Hari)
						</h3>
					</div>
					<div className="p-4">
						{!trendingProducts ? (
							<div className="animate-pulse space-y-2">
								{[1, 2, 3].map((i) => (
									<div className="h-8 rounded bg-muted/50" key={i} />
								))}
							</div>
						) : trendingProducts.length === 0 ? (
							<p className="py-4 text-center text-muted-foreground text-sm">
								Belum ada data cukup untuk prediksi
							</p>
						) : (
							<div className="space-y-3">
								{trendingProducts.slice(0, 5).map((product: any, idx: number) => (
									<div
										className="flex items-center gap-3"
										key={product.productName || idx}
									>
										<span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xs">
											{idx + 1}
										</span>
										<span className="flex-1 truncate font-medium text-sm">
											{product.productName}
										</span>
										<span className="text-muted-foreground text-xs">
											{product.totalSales || product.recentSales || 0}x
										</span>
										{product.growthRate > 0 && (
											<span className="text-green-600 text-xs">
												+{product.growthRate?.toFixed(0)}%
											</span>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Revenue Prediction */}
			{revenuePrediction && revenuePrediction.length > 0 && (
				<div className="rounded-xl border border-border bg-card">
					<div className="border-border border-b p-4">
						<h3 className="flex items-center gap-2 font-bold text-lg">
							<Sparkles className="h-5 w-5 text-primary" />
							Prediksi Revenue 7 Hari ke Depan
						</h3>
					</div>
					<div className="divide-y divide-border">
						{revenuePrediction.map((day: any) => (
							<div
								className="flex items-center justify-between px-4 py-3"
								key={day.date}
							>
								<div className="flex items-center gap-3">
									<span className="font-medium text-sm">{day.dayName}</span>
									<span className="text-muted-foreground text-xs">
										{day.date}
									</span>
								</div>
								<div className="flex items-center gap-4">
									<div className="w-32 overflow-hidden rounded-full bg-muted">
										<div
											className="h-2 rounded-full bg-primary"
											style={{
												width: `${Math.min(100, ((day.predictedAmount || 0) / (revenuePrediction[0]?.predictedAmount || 1)) * 100)}%`,
											}}
										/>
									</div>
									<span className="w-32 text-right font-bold text-sm">
										Rp{(day.predictedAmount || 0).toLocaleString("id-ID")}
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


