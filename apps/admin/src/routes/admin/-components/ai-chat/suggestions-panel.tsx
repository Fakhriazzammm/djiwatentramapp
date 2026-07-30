import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
	Package, 
	DollarSign, 
	Megaphone, 
	Settings, 
	ChevronDown, 
	ChevronUp, 
	Sparkles,
	Play,
	Zap,
	AlertTriangle,
	Lightbulb,
	CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "./types";

interface SuggestionsPanelProps {
	suggestions: Suggestion[];
	onExecute: (s: Suggestion) => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; border: string; bg: string }> = {
	inventory: { label: "Inventaris", icon: Package, color: "text-amber-600", border: "border-amber-300", bg: "bg-amber-50" },
	finance: { label: "Keuangan", icon: DollarSign, color: "text-green-600", border: "border-green-300", bg: "bg-green-50" },
	marketing: { label: "Pemasaran", icon: Megaphone, color: "text-purple-600", border: "border-purple-300", bg: "bg-purple-50" },
	operations: { label: "Operasional", icon: Settings, color: "text-blue-600", border: "border-blue-300", bg: "bg-blue-50" },
};

const PRIORITY_CONFIG = {
	high: { label: "Urgent", color: "text-red-700 bg-red-50 border-red-200", icon: AlertTriangle },
	medium: { label: "Penting", color: "text-amber-700 bg-amber-50 border-amber-200", icon: Zap },
	low: { label: "Normal", color: "text-blue-700 bg-blue-50 border-blue-200", icon: Lightbulb },
};

function categorizeSuggestion(s: Suggestion): string {
	const t = `${s.title} ${s.description} ${s.type}`.toLowerCase();
	if (/stok|inventaris|restock|bahan|persediaan/.test(t)) return "inventory";
	if (/keuangan|laba|rugi|pendapatan|pengeluaran|kas|hpp|transaksi/.test(t)) return "finance";
	if (/promo|diskon|marketing|promosi|voucher|iklan/.test(t)) return "marketing";
	return "operations";
}

function getPriority(p: string): "high" | "medium" | "low" {
	if (p === "high") return "high";
	if (p === "medium") return "medium";
	return "low";
}

export const SuggestionsPanel = ({ 
	suggestions, 
	onExecute 
}: SuggestionsPanelProps) => {
	const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

	const toggleCategory = (cat: string) => {
		setCollapsedCategories(prev => {
			const next = new Set(prev);
			if (next.has(cat)) next.delete(cat);
			else next.add(cat);
			return next;
		});
	};

	if (!suggestions || suggestions.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-8 text-center">
				<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30 border border-border/40 mb-3">
					<Lightbulb className="h-6 w-6 text-muted-foreground/40" />
				</div>
				<h3 className="text-sm font-bold text-foreground mb-1">Belum Ada Saran</h3>
				<p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
					Yumi AI sedang menganalisis data bisnis Anda. Saran akan muncul secara otomatis.
				</p>
			</div>
		);
	}

	// Group by category
	const grouped: Record<string, Suggestion[]> = {};
	const sorted = [...suggestions].sort((a, b) => {
		const po = { high: 0, medium: 1, low: 2 };
		return (po[a.priority] ?? 2) - (po[b.priority] ?? 2);
	});
	for (const s of sorted) {
		const cat = categorizeSuggestion(s);
		if (!grouped[cat]) grouped[cat] = [];
		grouped[cat].push(s);
	}

	const categoryOrder = ["inventory", "finance", "marketing", "operations"];
	const orderedCats = categoryOrder.filter(c => grouped[c]);

	const executeAll = (items: Suggestion[]) => {
		for (const s of items) {
			if (s.action) onExecute(s);
		}
	};

	return (
		<div className="p-4 pb-24 md:pb-10 overflow-y-auto h-full custom-scrollbar space-y-3">
			{/* Header */}
			<motion.div 
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				className="flex items-center justify-between p-3 rounded-2xl bg-primary/5 border border-primary/10"
			>
				<div className="flex items-center gap-2.5">
					<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
						<Sparkles className="h-4 w-4 text-primary" />
					</div>
					<div>
						<h2 className="text-[12px] font-black text-foreground tracking-tight">Saran AI</h2>
						<p className="text-[11px] text-muted-foreground font-medium">{suggestions.length} saran tersedia</p>
					</div>
				</div>
				{suggestions.filter(s => s.action).length > 1 && (
					<Button 
						size="sm" 
						variant="ghost" 
						className="h-7 text-[11px] font-bold text-primary hover:bg-primary/10"
						onClick={() => executeAll(suggestions.filter(s => s.action))}
					>
						<Play className="h-3 w-3 mr-1" />
						Jalankan Semua
					</Button>
				)}
			</motion.div>

			{/* Category sections */}
			{orderedCats.map((cat, catIdx) => {
				const config = CATEGORY_CONFIG[cat];
				const items = grouped[cat];
				const isCollapsed = collapsedCategories.has(cat);
				const Icon = config.icon;
				const highCount = items.filter(s => s.priority === "high").length;

				return (
					<motion.div 
						key={cat}
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: catIdx * 0.08 }}
						className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden"
					>
						{/* Category header */}
						<button
							onClick={() => toggleCategory(cat)}
							className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
							type="button"
						>
							<div className="flex items-center gap-2">
								<div className={`flex h-7 w-7 items-center justify-center rounded-lg ${config.bg} ${config.color}`}>
									<Icon className="h-3.5 w-3.5" />
								</div>
								<div className="text-left">
									<div className="flex items-center gap-1.5">
										<span className="text-[11px] font-black text-foreground">{config.label}</span>
										<span className="text-[11px] font-bold text-muted-foreground">{items.length} saran</span>
									</div>
									{highCount > 0 && (
										<span className="text-[10px] font-bold text-red-500">{highCount} urgent</span>
									)}
								</div>
							</div>
							{isCollapsed ? (
								<ChevronDown className="h-4 w-4 text-muted-foreground" />
							) : (
								<ChevronUp className="h-4 w-4 text-muted-foreground" />
							)}
						</button>

						{/* Items */}
						<AnimatePresence>
							{!isCollapsed && (
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: "auto", opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.2 }}
									className="overflow-hidden"
								>
									<div className="px-3 pb-3 space-y-2">
										{items.map((s) => {
											const pConf = PRIORITY_CONFIG[getPriority(s.priority)];
											const PIcon = pConf.icon;
											return (
												<motion.div
													key={s.id}
													initial={{ opacity: 0, x: -8 }}
													animate={{ opacity: 1, x: 0 }}
													className="relative p-3 rounded-xl bg-background/50 border border-border/40 hover:bg-background/80 transition-all group"
												>
													<div className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-full ${
														s.priority === "high" ? "bg-red-400" : 
														s.priority === "medium" ? "bg-amber-400" : "bg-blue-400"
													}`} />
													
													<div className="flex justify-between items-start gap-3 pl-2">
														<div className="flex-1 min-w-0">
															<div className="flex items-center gap-1.5 mb-0.5">
																<span className="font-bold text-[12px] text-foreground">{s.title}</span>
																<span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider border ${pConf.color}`}>
																	<PIcon className="h-2.5 w-2.5" />
																	{pConf.label}
																</span>
															</div>
															<p className="text-[10px] text-muted-foreground leading-relaxed">{s.description}</p>
														</div>
													</div>

													{s.action && (
														<div className="mt-2 pt-1.5 border-t border-border/30 pl-2 flex justify-end">
															<Button 
																size="sm" 
																className="h-7 text-[10px] font-bold gap-1 rounded-lg" 
																onClick={() => onExecute(s)}
															>
																<Play className="h-3 w-3" />
																Jalankan
															</Button>
														</div>
													)}
												</motion.div>
											);
										})}
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</motion.div>
				);
			})}
		</div>
	);
};
