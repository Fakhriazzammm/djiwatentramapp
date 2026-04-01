import React from "react";
import { 
	TrendingUp, 
	AlertTriangle, 
	Clock, 
	Wallet, 
	Calendar, 
	Sparkles, 
	Loader2,
	Target,
	ArrowUpRight
} from "lucide-react";
import { toRupiah } from "./utils";

interface PredictionsPanelProps {
	stockPredictions: any;
	busyHours: any;
	revenue: any;
	trending: any;
	promoTime: any;
}

const LearningState = ({ text = "Sedang mempelajari tren data Anda..." }: { text?: string }) => (
	<div className="flex flex-col items-center justify-center py-6 text-center animate-pulse">
		<div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center mb-2">
			<Loader2 className="h-4 w-4 text-primary animate-spin" />
		</div>
		<p className="text-[10px] md:text-[11px] text-muted-foreground font-medium px-4">{text}</p>
	</div>
);

export const PredictionsPanel = ({ 
	stockPredictions, 
	busyHours, 
	revenue, 
	trending, 
	promoTime 
}: PredictionsPanelProps) => (
	<div className="px-4 pt-4 pb-24 md:pb-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto h-full custom-scrollbar">
		<PredictionCard 
			title="Prediksi Stok Habis" 
			subtitle="Berbasis estimasi penjualan 7 hari"
			icon={<AlertTriangle className="h-4 w-4" />}
			variant="warning"
		>
			{Array.isArray(stockPredictions) && stockPredictions.length > 0 ? (
				<ul className="space-y-2 mt-2">
					{stockPredictions.map((p: any) => (
						<li key={p.productId} className="group p-2 rounded-xl bg-background/40 hover:bg-background/60 border border-border/40 transition-all">
							<div className="flex justify-between items-center">
								<span className="text-[11px] font-semibold text-foreground truncate max-w-[120px]">{p.productName}</span>
								<div className="flex flex-col items-end">
									<span className="text-[10px] font-bold text-destructive">Kritis</span>
									<span className="text-[9px] text-muted-foreground">sisa {p.currentStock ?? 0}</span>
								</div>
							</div>
						</li>
					))}
				</ul>
			) : <LearningState text="Stok terpantau aman untuk 7 hari ke depan." />}
		</PredictionCard>
		
		<PredictionCard 
			title="Prediksi Jam Sibuk" 
			subtitle="Optimalisasi jadwal operasional"
			icon={<Clock className="h-4 w-4" />}
			variant="info"
		>
			{Array.isArray(busyHours) && busyHours.length > 0 ? (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{busyHours.map((hour: string, i: number) => (
						<span key={i} className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200">
							{hour}
						</span>
					))}
				</div>
			) : <LearningState text="Mempelajari pola kedatangan pelanggan hari ini..." />}
		</PredictionCard>
		
		<PredictionCard 
			title="Prediksi Pendapatan" 
			subtitle="Estimasi 7 hari ke depan"
			icon={<TrendingUp className="h-4 w-4" />}
			variant="success"
		>
			{revenue && (typeof revenue.predictedRevenue === 'number' || revenue.predictedRevenue) ? (
				<div className="mt-2 p-3 rounded-2xl bg-gradient-to-br from-green-50 to-green-100/30 border border-green-200/50">
					<p className="text-[10px] font-bold text-green-700/60 uppercase tracking-wider mb-0.5">Estimasi Total</p>
					<p className="text-xl font-bold text-green-700 tracking-tight">Rp {toRupiah(revenue.predictedRevenue)}</p>
					<div className="mt-2 flex items-center gap-1 text-green-600">
						<ArrowUpRight className="h-3 w-3" />
						<span className="text-[9px] font-bold">Tren Positif</span>
					</div>
				</div>
			) : <LearningState text="Menganalisis riwayat transaksi untuk estimasi akurat..." />}
		</PredictionCard>
		
		<PredictionCard 
			title="Performa Rata-rata" 
			subtitle="Berdasarkan data operasional saat ini"
			icon={<Wallet className="h-4 w-4" />}
			variant="primary"
		>
			{revenue && (typeof revenue.currentAvgDaily === 'number' || revenue.currentAvgDaily) ? (
				<div className="mt-2 p-3 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/10">
					<p className="text-[10px] font-bold text-primary/60 uppercase tracking-wider mb-0.5">Rata-rata Harian</p>
					<p className="text-xl font-bold text-primary tracking-tight">Rp {toRupiah(revenue.currentAvgDaily)}</p>
				</div>
			) : <LearningState text="Menghitung rerata produktivitas bisnis..." />}
		</PredictionCard>

		<PredictionCard 
			title="Produk Tren" 
			subtitle="Peningkatan minat (7 hari)"
			icon={<Sparkles className="h-4 w-4" />}
			variant="accent"
		>
			{Array.isArray(trending) && trending.length > 0 ? (
				<ul className="space-y-2 mt-2">
					{trending.map((p: any) => (
						<li key={p.productId} className="flex justify-between items-center p-2 rounded-xl bg-background/40 hover:bg-background/60 border border-border/40 transition-all">
							<span className="text-[11px] font-medium text-foreground">{p.productName}</span>
							<span className="flex items-center gap-1 font-bold text-green-600 text-[10px] bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
								<ArrowUpRight className="h-3 w-3" />
								{p.growthPercentage ?? 0}%
							</span>
						</li>
					))}
				</ul>
			) : <LearningState text="Mendeteksi lonjakan minat produk Anda..." />}
		</PredictionCard>
		
		<PredictionCard 
			title="Momen Promo Terbaik" 
			subtitle="Probabilitas konversi tertinggi"
			icon={<Target className="h-4 w-4" />}
			variant="secondary"
		>
			{promoTime && promoTime.bestDay && promoTime.bestHour !== undefined ? (
				<div className="mt-2 p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100">
					<div className="flex gap-3">
						<div className="flex-1">
							<p className="text-[9px] font-bold text-indigo-400 capitalize">Hari</p>
							<p className="text-xs font-bold text-indigo-700">{promoTime.bestDay}</p>
						</div>
						<div className="flex-1">
							<p className="text-[9px] font-bold text-indigo-400 capitalize">Waktu</p>
							<p className="text-xs font-bold text-indigo-700">{promoTime.bestHour}:00</p>
						</div>
					</div>
				</div>
			) : <LearningState text="Menentukan waktu ideal untuk promosi..." />}
		</PredictionCard>
	</div>
);

const PredictionCard = ({ 
	title, 
	subtitle,
	icon, 
	children,
	variant = "primary" 
}: { 
	title: string, 
	subtitle?: string,
	icon?: React.ReactNode, 
	children: React.ReactNode,
	variant?: "primary" | "success" | "warning" | "info" | "accent" | "secondary"
}) => {
	const variants = {
		primary: "text-primary bg-primary/5 border-primary/20",
		success: "text-green-600 bg-green-50 border-green-200",
		warning: "text-amber-600 bg-amber-50 border-amber-200",
		info: "text-blue-600 bg-blue-50 border-blue-200",
		accent: "text-purple-600 bg-purple-50 border-purple-200",
		secondary: "text-indigo-600 bg-indigo-50 border-indigo-200"
	};

	return (
		<div className="group animate-in fade-in zoom-in duration-500">
			<div className="h-full p-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/80 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-500 relative overflow-hidden">
				{/* Background Decoration */}
				<div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-3xl opacity-20 ${variants[variant].split(" ")[1]}`} />
				
				<div className="relative z-10">
					<div className="flex gap-2.5 items-start mb-3">
						<div className={`p-2 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-110 shadow-inner ${variants[variant]}`}>
							{icon}
						</div>
						<div className="min-w-0">
							<h3 className="font-bold text-[13px] text-foreground leading-tight">{title}</h3>
							{subtitle && <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{subtitle}</p>}
						</div>
					</div>
					<div className="mt-1">
						{children}
					</div>
				</div>
			</div>
		</div>
	);
};
