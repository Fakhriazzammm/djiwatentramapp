import { formatCurrencyIDR } from "@/lib/export-utils";
import { Target, TrendingUp, CheckCircle2, ChevronRight, Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useHybridShiftTargetProgress } from "@/hooks/use-hybrid-finance-analytics-data";

export function ShiftTargetBanner() {
	const progress = useHybridShiftTargetProgress();

	if (!progress) return null;

	const { shiftProgress, dailyProgress, isShiftMet, isDailyMet, shiftTarget, shiftCollected, dailyTarget, dailyCollected } = progress;

	return (
		<div className="px-3 py-1">
			<motion.div
				initial={{ opacity: 0, y: -6 }}
				animate={{ opacity: 1, y: 0 }}
				className="relative overflow-hidden rounded-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-1.5 shadow-sm border border-slate-200/60 dark:border-white/5"
			>
				<div className="relative flex items-center justify-between gap-2">
					{/* Shift Progress */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center justify-between mb-1">
							<div className="flex items-center gap-1.5">
								<div className={`w-4 h-4 rounded-md flex items-center justify-center ${isShiftMet ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50'}`}>
									{isShiftMet ? <CheckCircle2 className="h-3 w-3" /> : <Target className="h-3 w-3" />}
								</div>
								<span className="text-[10px] font-bold uppercase tracking-wider text-slate-900 dark:text-white/80">Sesi</span>
							</div>
							<span className={`text-[11px] font-black ${isShiftMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'}`}>
								{shiftProgress.toFixed(0)}%
							</span>
						</div>
						<div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
							<motion.div
								initial={{ width: 0 }}
								animate={{ width: `${shiftProgress}%` }}
								className={`h-full rounded-full transition-all duration-1000 ${isShiftMet ? 'bg-emerald-500' : 'bg-primary'}`}
							/>
						</div>
						<div className="flex items-center justify-between text-[7px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-tighter mt-0.5">
							<span>{formatCurrencyIDR(shiftCollected, true)}</span>
							<span className="opacity-50">Tgt: {formatCurrencyIDR(shiftTarget, true)}</span>
						</div>
					</div>

					{/* Divider */}
					<div className="h-6 w-px bg-slate-200 dark:bg-white/10" />

					{/* Daily Progress */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center justify-between mb-1">
							<div className="flex items-center gap-1.5">
								<div className={`w-4 h-4 rounded-md flex items-center justify-center ${isDailyMet ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50'}`}>
									{isDailyMet ? <CheckCircle2 className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
								</div>
								<span className="text-[10px] font-bold uppercase tracking-wider text-slate-900 dark:text-white/80">Harian</span>
							</div>
							<span className={`text-[11px] font-black ${isDailyMet ? 'text-blue-600 dark:text-blue-400' : 'text-blue-500/80'}`}>
								{dailyProgress.toFixed(0)}%
							</span>
						</div>
						<div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
							<motion.div
								initial={{ width: 0 }}
								animate={{ width: `${dailyProgress}%` }}
								className={`h-full rounded-full transition-all duration-1000 ${isDailyMet ? 'bg-blue-500' : 'bg-blue-400'}`}
							/>
						</div>
						<div className="flex items-center justify-between text-[7px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-tighter mt-0.5">
							<span>{formatCurrencyIDR(dailyCollected, true)}</span>
							<span className="opacity-50">Tgt: {formatCurrencyIDR(dailyTarget, true)}</span>
						</div>
					</div>

					{/* Achievement Badge */}
					<AnimatePresence>
						{(isShiftMet || isDailyMet) && (
							<motion.div
								initial={{ opacity: 0, scale: 0.8 }}
								animate={{ opacity: 1, scale: 1 }}
								className="shrink-0 ml-1 flex items-center gap-1 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20 rounded-md px-1.5 py-0.5"
							>
								<Flame aria-hidden="true" className="h-3 w-3" />
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</motion.div>
		</div>
	);
}
