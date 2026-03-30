import { useQuery } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { Target, TrendingUp, CheckCircle2, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function ShiftTargetBanner() {
	const progress = useQuery(api.finance.getShiftTargetProgress);

	if (!progress) return null;

	const { shiftProgress, dailyProgress, isShiftMet, isDailyMet, shiftTarget, shiftCollected, dailyTarget, dailyCollected } = progress;

	return (
		<div className="px-4 py-2">
			<motion.div 
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-3 shadow-lg shadow-slate-900/10 border border-white/5"
			>
				{/* Background Decoration */}
				<div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
				<div className="absolute -left-4 -bottom-4 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl" />

				<div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
					{/* Left: Shift Progress */}
					<div className="flex flex-1 items-center gap-4 w-full">
						<div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isShiftMet ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white/10 text-white/70'}`}>
							{isShiftMet ? <CheckCircle2 className="h-5 w-5" /> : <Target className="h-5 w-5" />}
						</div>
						<div className="flex flex-1 flex-col gap-1.5 min-w-0">
							<div className="flex items-center justify-between">
								<span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Target Sesi Ini</span>
								<span className={`text-[10px] font-bold ${isShiftMet ? 'text-emerald-400' : 'text-primary'}`}>
									{shiftProgress.toFixed(0)}%
								</span>
							</div>
							<div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
								<motion.div 
									initial={{ width: 0 }}
									animate={{ width: `${shiftProgress}%` }}
									className={`h-full rounded-full transition-all duration-1000 ${isShiftMet ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]'}`}
								/>
							</div>
							<div className="flex items-center justify-between text-[9px] font-medium text-white/40">
								<span>{formatCurrencyIDR(shiftCollected)}</span>
								<span>{formatCurrencyIDR(shiftTarget)}</span>
							</div>
						</div>
					</div>

					{/* Divider (Desktop) */}
					<div className="hidden md:block h-10 w-px bg-white/10" />

					{/* Right: Daily Progress */}
					<div className="flex flex-1 items-center gap-4 w-full">
						<div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isDailyMet ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/10 text-white/70'}`}>
							{isDailyMet ? <CheckCircle2 className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
						</div>
						<div className="flex flex-1 flex-col gap-1.5 min-w-0">
							<div className="flex items-center justify-between">
								<span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Target Hari Ini</span>
								<span className={`text-[10px] font-bold ${isDailyMet ? 'text-blue-400' : 'text-blue-400/80'}`}>
									{dailyProgress.toFixed(0)}%
								</span>
							</div>
							<div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
								<motion.div 
									initial={{ width: 0 }}
									animate={{ width: `${dailyProgress}%` }}
									className={`h-full rounded-full transition-all duration-1000 ${isDailyMet ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-blue-500/60 shadow-[0_0_8px_rgba(59,130,246,0.3)]'}`}
								/>
							</div>
							<div className="flex items-center justify-between text-[9px] font-medium text-white/40">
								<span>{formatCurrencyIDR(dailyCollected)}</span>
								<span>{formatCurrencyIDR(dailyTarget)}</span>
							</div>
						</div>
					</div>

					{/* Floating Achievement Banner */}
					<AnimatePresence>
						{(isShiftMet || isDailyMet) && (
							<motion.div 
								initial={{ opacity: 0, scale: 0.8, x: 20 }}
								animate={{ opacity: 1, scale: 1, x: 0 }}
								className="shrink-0 flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-3 py-1.5"
							>
								<div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
								<span className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter">Target Tercapai! 🔥</span>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</motion.div>
		</div>
	);
}
