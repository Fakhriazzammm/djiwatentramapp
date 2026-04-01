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
	ArrowUpRight,
	Package,
	Zap,
	BarChart3,
	Gauge,
	ArrowDownRight,
	type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toRupiah } from "./utils";

interface PredictionsPanelProps {
	stockPredictions: any;
	busyHours: any;
	revenue: any;
	trending: any;
	promoTime: any;
}

const CONFIDENCE_CONFIG = {
	high: { label: "Tinggi", color: "text-green-600 bg-green-50 border-green-200", dot: "bg-green-500" },
	medium: { label: "Sedang", color: "text-amber-600 bg-amber-50 border-amber-200", dot: "bg-amber-500" },
	low: { label: "Rendah", color: "text-red-600 bg-red-50 border-red-200", dot: "bg-red-500" },
};

function getConfidence(data: any): "high" | "medium" | "low" {
	if (!data) return "low";
	if (Array.isArray(data)) return data.length > 0 ? "high" : "low";
	if (typeof data === "object") {
		const keys = Object.keys(data);
		if (keys.length === 0) return "low";
		if (data.confidence && data.confidence >= 70) return "high";
		return "medium";
	}
	return "low";
}

const ConfidenceBadge = ({ level }: { level: "high" | "medium" | "low" }) => {
	const config = CONFIDENCE_CONFIG[level];
	return (
		<span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${config.color}`}>
			<span className={`h-1.5 w-1.5 rounded-full ${config.dot} animate-pulse`} />
			{config.label}
		</span>
	);
};

const MiniBar = ({ value, maxVal, color = "bg-primary" }: { value: number; maxVal: number; color?: string }) => {
	const pct = Math.min(100, Math.max(0, (value / maxVal) * 100));
	return (
		<div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden">
			<motion.div 
				className={`h-full rounded-full ${color}`}
				initial={{ width: 0 }}
				animate={{ width: `${pct}%` }}
				transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
			/>
		</div>
	);
};

const TIPS: Record<string, string> = {
	stock: "Restock segera untuk menghindari kehabisan stok di jam sibuk.",
	busy: "Siapkan tenaga kerja tambahan pada jam-jam ini.",
	revenue: "Bandingkan dengan target bulanan untuk evaluasi.",
	performance: "Fokus meningkatkan produk dengan margin terbaik.",
	trending: "Manfaatkan tren untuk promosi dan upselling.",
	promo: "Jadwalkan promosi di waktu ini untuk hasil maksimal.",
};

const LearningState = ({ text = "Sedang mempelajari tren data Anda...", icon: Icon = Loader2 }: { text?: string; icon?: LucideIcon }) => (
	<div className="flex flex-col items-center justify-center py-5 text-center">
		<div className="h-9 w-9 bg-primary/10 rounded-full flex items-center justify-center mb-2 ring-1 ring-primary/10">
			<Icon className="h-4 w-4 text-primary animate-spin" />
		</div>
		<p className="text-[10px] text-muted-foreground font-medium px-4 leading-relaxed">{text}</p>
		<div className="flex gap-1 mt-2">
			<span className="h-1 w-1 bg-primary/40 rounded-full animate-bounce [animation-delay:0ms]" />
			<span className="h-1 w-1 bg-primary/40 rounded-full animate-bounce [animation-delay:150ms]" />
			<span className="h-1 w-1 bg-primary/40 rounded-full animate-bounce [animation-delay:300ms]" />
		</div>
	</div>
);

export const PredictionsPanel = ({ 
	stockPredictions, 
	busyHours, 
	revenue, 
	trending, 
	promoTime 
}: PredictionsPanelProps) => {
	const hasStock = Array.isArray(stockPredictions) && stockPredictions.length > 0;
	const hasBusy = Array.isArray(busyHours) && busyHours.length > 0;
	const hasRevenue = revenue && (typeof revenue.predictedRevenue === 'number' || revenue.predictedRevenue);
	const hasTrending = Array.isArray(trending) && trending.length > 0;
	const hasPromo = promoTime && promoTime.bestDay && promoTime.bestHour !== undefined;
	const activeCount = [hasStock, hasBusy, hasRevenue, hasTrending, hasPromo].filter(Boolean).length;
	const overallConfidence = activeCount >= 4 ? "high" : activeCount >= 2 ? "medium" : "low";

	return (
		<div className="px-4 pt-4 pb-24 md:pb-10 overflow-y-auto h-full custom-scrollbar space-y-4">
			{/* Dashboard Header */}
			<motion.div 
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				className="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5 border border-primary/10"
			>
				<div className="flex items-center gap-2.5">
					<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
						<Gauge className="h-4 w-4 text-primary" />
					</div>
					<div>
						<h2 className="text-[12px] font-black text-foreground tracking-tight">Dashboard Prediksi</h2>
						<p className="text-[9px] text-muted-foreground font-medium">{activeCount} dari 5 prediksi aktif</p>
					</div>
				</div>
				<ConfidenceBadge level={overallConfidence} />
			</motion.div>

			{/* Grid of prediction cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				<PredictionCard 
					title="Prediksi Stok Habis" 
					subtitle="Berbasis estimasi penjualan 7 hari"
					icon={<AlertTriangle className="h-4 w-4" />}
					variant="warning"
					tip={TIPS.stock}
					confidence={getConfidence(stockPredictions)}
				>
					{hasStock ? (
						<ul className="space-y-1.5 mt-2">
							{stockPredictions.slice(0, 5).map((p: any, i: number) => (
								<motion.li 
									key={p.productId} 
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: i * 0.06 }}
									className="group p-2 rounded-xl bg-background/40 hover:bg-background/60 border border-border/40 transition-all"
								>
									<div className="flex justify-between items-center gap-2">
										<div className="flex items-center gap-1.5 min-w-0">
											<Package className="h-3 w-3 text-amber-500 shrink-0" />
											<span className="text-[11px] font-semibold text-foreground truncate">{p.productName}</span>
										</div>
										<div className="flex flex-col items-end shrink-0">
											<span className="text-[9px] font-black text-destructive uppercase">Kritis</span>
											<span className="text-[8px] text-muted-foreground">sisa {p.currentStock ?? 0}</span>
										</div>
									</div>
									<MiniBar value={p.currentStock ?? 0} maxVal={p.threshold ?? 50} color="bg-amber-400" />
								</motion.li>
							))}
						</ul>
					) : <LearningState text="Stok terpantau aman untuk 7 hari ke depan." icon={Package} />}
				</PredictionCard>
				
				<PredictionCard 
					title="Prediksi Jam Sibuk" 
					subtitle="Optimalisasi jadwal operasional"
					icon={<Clock className="h-4 w-4" />}
					variant="info"
					tip={TIPS.busy}
					confidence={getConfidence(busyHours)}
				>
					{hasBusy ? (
						<div className="mt-2.5 flex flex-wrap gap-1.5">
							<AnimatePresence>
								{busyHours.map((hour: string, i: number) => (
									<motion.span 
										key={i} 
										initial={{ scale: 0, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										transition={{ delay: i * 0.05, type: "spring", stiffness: 400 }}
										className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200 hover:bg-blue-100 transition-colors cursor-default"
									>
										{hour}
									</motion.span>
								))}
							</AnimatePresence>
						</div>
					) : <LearningState text="Mempelajari pola kedatangan pelanggan hari ini..." icon={Clock} />}
				</PredictionCard>
				
				<PredictionCard 
					title="Prediksi Pendapatan" 
					subtitle="Estimasi 7 hari ke depan"
					icon={<TrendingUp className="h-4 w-4" />}
					variant="success"
					tip={TIPS.revenue}
					confidence={getConfidence(revenue)}
				>
					{hasRevenue ? (
						<div className="mt-2 p-3 rounded-2xl bg-gradient-to-br from-green-50 to-green-100/30 border border-green-200/50">
							<p className="text-[9px] font-black text-green-700/60 uppercase tracking-wider mb-0.5">Estimasi Total</p>
							<p className="text-xl font-black text-green-700 tracking-tight">Rp {toRupiah(revenue.predictedRevenue)}</p>
							<div className="mt-2 flex items-center gap-1 text-green-600">
								<ArrowUpRight className="h-3 w-3" />
								<span className="text-[9px] font-bold">Tren Positif</span>
							</div>
						</div>
					) : <LearningState text="Menganalisis riwayat transaksi untuk estimasi akurat..." icon={TrendingUp} />}
				</PredictionCard>
				
				<PredictionCard 
					title="Performa Rata-rata" 
					subtitle="Berdasarkan data operasional saat ini"
					icon={<BarChart3 className="h-4 w-4" />}
					variant="primary"
					tip={TIPS.performance}
					confidence={getConfidence(revenue)}
				>
					{revenue && (typeof revenue.currentAvgDaily === 'number' || revenue.currentAvgDaily) ? (
						<div className="mt-2 p-3 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/10">
							<p className="text-[9px] font-black text-primary/60 uppercase tracking-wider mb-0.5">Rata-rata Harian</p>
							<p className="text-xl font-black text-primary tracking-tight">Rp {toRupiah(revenue.currentAvgDaily)}</p>
							<MiniBar value={revenue.currentAvgDaily ?? 0} maxVal={revenue.predictedRevenue ?? 1} color="bg-primary" />
						</div>
					) : <LearningState text="Menghitung rerata produktivitas bisnis..." icon={BarChart3} />}
				</PredictionCard>

				<PredictionCard 
					title="Produk Tren" 
					subtitle="Peningkatan minat (7 hari)"
					icon={<Zap className="h-4 w-4" />}
					variant="accent"
					tip={TIPS.trending}
					confidence={getConfidence(trending)}
				>
					{hasTrending ? (
						<ul className="space-y-1.5 mt-2">
							{trending.slice(0, 5).map((p: any, i: number) => (
								<motion.li 
									key={p.productId}
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: i * 0.06 }}
									className="flex justify-between items-center p-2 rounded-xl bg-background/40 hover:bg-background/60 border border-border/40 transition-all gap-2"
								>
									<div className="flex items-center gap-2 min-w-0">
										<span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-[9px] font-black shrink-0">
											{i + 1}
										</span>
										<span className="text-[11px] font-medium text-foreground truncate">{p.productName}</span>
									</div>
									<span className="flex items-center gap-0.5 font-bold text-green-600 text-[10px] bg-green-50 px-2 py-0.5 rounded-full border border-green-100 shrink-0">
										<ArrowUpRight className="h-3 w-3" />
										{p.growthPercentage ?? 0}%
									</span>
								</motion.li>
							))}
						</ul>
					) : <LearningState text="Mendeteksi lonjakan minat produk Anda..." icon={Zap} />}
				</PredictionCard>
				
				<PredictionCard 
					title="Momen Promo Terbaik" 
					subtitle="Probabilitas konversi tertinggi"
					icon={<Target className="h-4 w-4" />}
					variant="secondary"
					tip={TIPS.promo}
					confidence={getConfidence(promoTime)}
				>
					{hasPromo ? (
						<div className="mt-2 p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100">
							<div className="flex gap-3">
								<div className="flex-1">
									<p className="text-[9px] font-black text-indigo-400 uppercase">Hari</p>
									<p className="text-xs font-black text-indigo-700 capitalize">{promoTime.bestDay}</p>
								</div>
								<div className="flex-1">
									<p className="text-[9px] font-black text-indigo-400 uppercase">Waktu</p>
									<p className="text-xs font-black text-indigo-700">{promoTime.bestHour}:00</p>
								</div>
							</div>
							<div className="mt-2 flex items-center gap-1 text-indigo-500">
								<Sparkles className="h-3 w-3" />
								<span className="text-[8px] font-bold">Waktu terbaik untuk promosi</span>
							</div>
						</div>
					) : <LearningState text="Menentukan waktu ideal untuk promosi..." icon={Target} />}
				</PredictionCard>
			</div>
		</div>
	);
};

const PredictionCard = ({ 
	title, 
	subtitle,
	icon, 
	children,
	variant = "primary",
	tip,
	confidence,
}: { 
	title: string, 
	subtitle?: string,
	icon?: React.ReactNode, 
	children: React.ReactNode,
	variant?: "primary" | "success" | "warning" | "info" | "accent" | "secondary"
	tip?: string,
	confidence?: "high" | "medium" | "low",
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
		<motion.div 
			initial={{ opacity: 0, y: 15 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4 }}
			className="group"
		>
			<div className="h-full p-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/80 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-500 relative overflow-hidden">
				<div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-3xl opacity-20 ${variants[variant].split(" ")[1]}`} />
				
				<div className="relative z-10">
					<div className="flex gap-2.5 items-start mb-3">
						<div className={`p-2 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-110 shadow-inner ${variants[variant]}`}>
							{icon}
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<h3 className="font-bold text-[13px] text-foreground leading-tight">{title}</h3>
								{confidence && <ConfidenceBadge level={confidence} />}
							</div>
							{subtitle && <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{subtitle}</p>}
						</div>
					</div>
					<div className="mt-1">
						{children}
					</div>
					{tip && (
						<div className="mt-2.5 pt-2 border-t border-border/30">
							<p className="text-[9px] text-muted-foreground/60 italic leading-relaxed flex items-start gap-1">
								<Zap className="h-3 w-3 shrink-0 mt-0.5 text-primary/40" />
								{tip}
							</p>
						</div>
					)}
				</div>
			</div>
		</motion.div>
	);
};
