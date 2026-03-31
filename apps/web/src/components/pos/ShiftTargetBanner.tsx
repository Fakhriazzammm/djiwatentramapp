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
		<div className="px-4 py-1">
			<motion.div 
				initial={{ opacity: 0, y: -8 }}
				animate={{ opacity: 1, y: 0 }}
				className="relative overflow-hidden rounded-xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-1.5 shadow-sm border border-slate-200/60 dark:border-white/5"
			>
				<div className="relative flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6">
					{/* Left: Shift Progress */}
					<div className="flex flex-1 items-center gap-3 w-full">
						<div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${isShiftMet ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50'}`}>
							{isShiftMet ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />}
						</div>
						<div className="flex flex-1 flex-col gap-1 min-w-0">
							<div className="flex items-center justify-between">
								<span className="text-[9px] font-bold uppercase tracking-wider text-slate-900 dark:text-white/80">Target Sesi Ini</span>
								<span className={`text-[10px] font-black ${isShiftMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`}>
									{shiftProgress.toFixed(0)}%
								</span>
							</div>
							<div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
								<motion.div 
									initial={{ width: 0 }}
									animate={{ width: `${shiftProgress}%` }}
									className={`h-full rounded-full transition-all duration-1000 ${isShiftMet ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-primary shadow-[0_0_8px_rgba(var(--primary),0.3)]'}`}
								/>
							</div>
							<div className="flex items-center justify-between text-[8px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-tighter">
								<span>{formatCurrencyIDR(shiftCollected)}</span>
								<span className="opacity-50">Tgt: {formatCurrencyIDR(shiftTarget)}</span>
							</div>
						</div>
					</div>

					{/* Divider (Desktop) */}
					<div className="hidden sm:block h-8 w-px bg-slate-200 dark:bg-white/10" />

					{/* Right: Daily Progress */}
					<div className="flex flex-1 items-center gap-3 w-full">
						<div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${isDailyMet ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50'}`}>
							{isDailyMet ? <CheckCircle2 className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
						</div>
						<div className="flex flex-1 flex-col gap-1 min-w-0">
							<div className="flex items-center justify-between">
								<span className="text-[9px] font-bold uppercase tracking-wider text-slate-900 dark:text-white/80">Target Hari Ini</span>
								<span className={`text-[10px] font-black ${isDailyMet ? 'text-blue-600 dark:text-blue-400' : 'text-blue-500/80'}`}>
									{dailyProgress.toFixed(0)}%
								</span>
							</div>
							<div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
								<motion.div 
									initial={{ width: 0 }}
									animate={{ width: `${dailyProgress}%` }}
									className={`h-full rounded-full transition-all duration-1000 ${isDailyMet ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.2)]'}`}
								/>
							</div>
							<div className="flex items-center justify-between text-[8px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-tighter">
								<span>{formatCurrencyIDR(dailyCollected)}</span>
								<span className="opacity-50">Tgt: {formatCurrencyIDR(dailyTarget)}</span>
							</div>
						</div>
					</div>

					{/* Achievement Badge */}
					<AnimatePresence>
						{(isShiftMet || isDailyMet) && (
							<motion.div 
								initial={{ opacity: 0, scale: 0.8, x: 10 }}
								animate={{ opacity: 1, scale: 1, x: 0 }}
								className="shrink-0 flex items-center gap-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 rounded-lg px-2 py-1"
							>
								<div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
								<span className="text-[9px] font-black uppercase tracking-tight">Tercapai! 🔥</span>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</motion.div>
		</div>
	);
}
