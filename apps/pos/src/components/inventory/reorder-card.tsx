import { motion } from "framer-motion";
import {
	ChevronDown,
	Package,
	ShoppingCart,
} from "lucide-react";
import { useState, useMemo } from "react";

interface ReorderItem {
	ingredientName: string;
	currentStock: number;
	unit: string;
	reorderPoint: number;
	suggestedOrderQty: number;
	preferredStoreName: string | null;
	lastPurchasePrice: number | null;
	riskLevel: "high" | "medium" | "low";
}

interface ReorderCardProps {
	items: ReorderItem[];
}

export function ReorderCard({ items }: ReorderCardProps) {
	const [expanded, setExpanded] = useState(false);
	const needsReorder = useMemo(
		() => items.filter((i) => i.currentStock <= i.reorderPoint),
		[items]
	);
	const displayItems = expanded ? needsReorder : needsReorder.slice(0, 5);

	if (needsReorder.length === 0) return null;

	const totalEstimate = needsReorder.reduce(
		(sum, i) => sum + (i.suggestedOrderQty ?? 0) * (i.lastPurchasePrice ?? 0),
		0
	);

	return (
		<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm md:p-5">
			{/* Header */}
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-200 text-amber-700">
						<ShoppingCart className="h-4 w-4" />
					</div>
					<div>
						<h3 className="font-bold text-sm text-amber-900 tracking-tight">
							🛒 Belanja Rekomendasi
						</h3>
						<p className="text-[10px] font-medium text-amber-700">
							{needsReorder.length} item perlu dibeli ulang
						</p>
					</div>
				</div>
				{needsReorder.length > 0 && (
					<span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-black text-amber-800">
						{needsReorder.length}
					</span>
				)}
			</div>

			{/* Daftar item */}
			<div className="space-y-1.5">
				{displayItems.map((item, idx) => (
					<div
						className="flex flex-wrap items-center justify-between gap-1 rounded-xl border border-amber-200/60 bg-white p-2.5 transition-all hover:border-amber-300 md:flex-nowrap md:p-3"
						key={`${item.ingredientName}-${idx}`}
					>
						<div className="flex items-center gap-2.5 min-w-0 flex-1">
							<div
								className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
									item.riskLevel === "high"
										? "bg-red-100 text-red-600"
										: item.riskLevel === "medium"
											? "bg-amber-100 text-amber-600"
											: "bg-yellow-100 text-yellow-600"
								}`}
							>
								<Package className="h-3.5 w-3.5" />
							</div>
							<div className="min-w-0">
								<p className="truncate text-[12px] font-semibold text-slate-800 leading-tight">
									{item.ingredientName}
								</p>
								<p className="text-[10px] text-slate-500">
									Stok: {item.currentStock} {item.unit}
									{item.preferredStoreName && ` · ${item.preferredStoreName}`}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2 shrink-0 ml-auto md:ml-2">
							<div className="text-right">
								<p className="text-[10px] font-bold text-amber-800">
									{item.suggestedOrderQty} {item.unit}
								</p>
								{item.lastPurchasePrice != null && (
									<p className="text-[9px] text-slate-400">
										~Rp{(item.suggestedOrderQty * item.lastPurchasePrice).toLocaleString("id-ID")}
									</p>
								)}
							</div>
						</div>
					</div>
				))}
			</div>

			{/* Lihat semua */}
			{needsReorder.length > 5 && (
				<button
					className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-bold text-amber-700 transition-all hover:bg-amber-100"
					onClick={() => setExpanded(!expanded)}
					type="button"
				>
					{expanded ? "Tutup" : `Lihat ${needsReorder.length - 5} lainnya`}
					<motion.div
						animate={{ rotate: expanded ? 180 : 0 }}
						transition={{ duration: 0.2 }}
					>
						<ChevronDown className="h-3.5 w-3.5" />
					</motion.div>
				</button>
			)}

			{/* Estimasi total */}
			{totalEstimate > 0 && (
				<div className="mt-3 flex items-center justify-between rounded-xl border border-amber-300/50 bg-amber-100/50 px-3 py-2">
					<span className="text-[11px] font-semibold text-amber-800">
						Estimasi Total Belanja
					</span>
					<span className="font-black text-sm text-amber-900">
						Rp{totalEstimate.toLocaleString("id-ID")}
					</span>
				</div>
			)}
		</div>
	);
}
