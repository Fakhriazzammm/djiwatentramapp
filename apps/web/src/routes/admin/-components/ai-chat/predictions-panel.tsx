import React from "react";
import { toRupiah } from "./utils";

interface PredictionsPanelProps {
	stockPredictions: any;
	busyHours: any;
	revenue: any;
	trending: any;
	promoTime: any;
}

export const PredictionsPanel = ({ 
	stockPredictions, 
	busyHours, 
	revenue, 
	trending, 
	promoTime 
}: PredictionsPanelProps) => (
	<div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto h-full">
		<PredictionCard title="Prediksi Stok Habis (7 Hari)">
			{Array.isArray(stockPredictions) && stockPredictions.length > 0 ? (
				<ul className="space-y-2">
					{stockPredictions.map((p: any) => (
						<li key={p.productId} className="text-sm flex justify-between">
							<span>{p.productName}</span>
							<span className="font-bold">sisa {p.currentStock ?? 0}</span>
						</li>
					))}
				</ul>
			) : <p className="text-sm text-muted-foreground">Stok aman.</p>}
		</PredictionCard>
		
		<PredictionCard title="Prediksi Jam Sibuk Hari Ini">
			{Array.isArray(busyHours) && busyHours.length > 0 ? (
				<p className="text-sm">{busyHours.join(", ")}</p>
			) : <p className="text-sm text-muted-foreground">Data tidak cukup.</p>}
		</PredictionCard>
		
		<PredictionCard title="Prediksi Pendapatan (7 Hari)">
			{revenue && (typeof revenue.predictedRevenue === 'number' || revenue.predictedRevenue) ? (
				<p className="text-2xl font-bold text-green-600">Rp {toRupiah(revenue.predictedRevenue)}</p>
			) : <p className="text-sm text-muted-foreground">Data tidak cukup.</p>}
		</PredictionCard>
		
		<PredictionCard title="Rata-rata Harian Saat Ini">
			{revenue && (typeof revenue.currentAvgDaily === 'number' || revenue.currentAvgDaily) ? (
				<p className="text-2xl font-bold text-blue-600">Rp {toRupiah(revenue.currentAvgDaily)}</p>
			) : <p className="text-sm text-muted-foreground">Data tidak cukup.</p>}
		</PredictionCard>

		<PredictionCard title="Produk Tren (7 Hari)">
			{Array.isArray(trending) && trending.length > 0 ? (
				<ul className="space-y-2">
					{trending.map((p: any) => (
						<li key={p.productId} className="text-sm flex justify-between">
							<span>{p.productName}</span>
							<span className="font-bold text-green-600">+{p.growthPercentage ?? 0}%</span>
						</li>
					))}
				</ul>
			) : <p className="text-sm text-muted-foreground">Tidak ada tren signifikan.</p>}
		</PredictionCard>
		
		<PredictionCard title="Waktu Promo Terbaik">
			{promoTime && promoTime.bestDay && promoTime.bestHour !== undefined ? (
				<p className="text-sm">Hari: <span className="font-bold">{promoTime.bestDay}</span>, Jam: <span className="font-bold">{promoTime.bestHour}:00</span></p>
			) : <p className="text-sm text-muted-foreground">Data tidak cukup.</p>}
		</PredictionCard>
	</div>
);

const PredictionCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
	<div className="p-4 border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow">
		<h3 className="font-semibold mb-2 text-sm text-foreground">{title}</h3>
		{children}
	</div>
);
