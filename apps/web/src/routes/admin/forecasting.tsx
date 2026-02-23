import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "@tkmpos/backend/convex/_generated/dataModel";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale/id";
import {
	AlertTriangle,
	BarChart3,
	RefreshCw,
	Sparkles,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// biome-ignore lint/suspicious/noExplicitAny: Route not yet in generated route tree
export const Route = createFileRoute("/admin/forecasting" as any)({
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
	// Placeholder data - replace with actual API calls when forecasting module is created
	const inventory:
		| Array<{
				_id: Id<"inventory">;
				ingredientName: string;
				quantity: number;
				unit: string;
		  }>
		| undefined = undefined;
	const stockoutPredictions: StockoutPrediction[] | undefined = undefined;

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
			// TODO: Replace with actual API call when forecasting module is created
			// const result = await generateForecast({
			// 	inventoryId: selectedInventory,
			// 	daysToForecast,
			// });
			toast.info("Forecasting module belum tersedia");
			setForecastResult(null);
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
			// TODO: Replace with actual API call when forecasting module is created
			// const results = await generateAllForecasts({ daysToForecast });
			toast.info("Forecasting module belum tersedia");
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
				<button
					className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
					disabled={loadingAll}
					onClick={handleGenerateAll}
					type="button"
				>
					<RefreshCw
						className={`h-4 w-4 ${loadingAll ? "animate-spin" : ""}`}
					/>
					{loadingAll ? "Generating..." : "Generate All"}
				</button>
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
						[1, 2, 3].map((i) => (
							<div className="animate-pulse p-4" key={i}>
								<div className="flex items-center justify-between">
									<div className="flex-1 space-y-2">
										<div className="h-4 w-32 rounded bg-muted/50" />
										<div className="h-3 w-48 rounded bg-muted/50" />
									</div>
									<div className="h-8 w-24 rounded bg-muted/50" />
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
		</div>
	);
}
