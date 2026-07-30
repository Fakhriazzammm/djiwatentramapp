import { motion } from "framer-motion";
import {
	Play,
	Square,
	Camera,
	Loader2,
	ArrowRight,
} from "lucide-react";

type HomeHeroOperationalProps = {
	greeting: string;
	firstName: string;
	storeName: string;
	dateText: string;
	isWorking: boolean;
	hasFaceDescriptor: boolean;
	workDurationLabel: string;
	shiftPct: number | null;
	activeShiftName: string;
	activeShiftTime: string;
	userRoleName: string;
	primaryActionTitle: string;
	isProcessing: boolean;
	onPrimaryAction: () => void;
	onAvatarClick: () => void;
};

export function HomeHeroOperational({
	greeting,
	firstName,
	storeName,
	dateText,
	isWorking,
	hasFaceDescriptor,
	workDurationLabel,
	shiftPct,
	activeShiftName,
	activeShiftTime,
	userRoleName,
	primaryActionTitle,
	isProcessing,
	onPrimaryAction,
	onAvatarClick,
}: HomeHeroOperationalProps) {
	const ctaBg = !hasFaceDescriptor
		? "bg-sky-500 text-white hover:bg-sky-600"
		: isWorking
			? "bg-amber-500 text-amber-950 hover:bg-amber-400"
			: "bg-emerald-500 text-emerald-950 hover:bg-emerald-400";

	const ctaIcon = isProcessing ? (
		<Loader2 className="h-5 w-5 animate-spin" />
	) : !hasFaceDescriptor ? (
		<Camera className="h-5 w-5" />
	) : isWorking ? (
		<Square className="h-5 w-5 fill-current" />
	) : (
		<Play className="h-5 w-5 fill-current" />
	);

	const progressColor =
		shiftPct !== null
			? shiftPct >= 100
				? "bg-emerald-500"
				: shiftPct >= 70
					? "bg-amber-500"
					: "bg-primary"
			: "bg-muted/30";

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			className="app-card glass-strong relative mb-5 overflow-hidden"
		>
			{/* Layered gradient background */}
			<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_30%)]" />
			{isWorking && (
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.07),transparent_40%)]" />
			)}

			{/* ── HEADER: Avatar + Identity ── */}
			<div className="flex items-center gap-3 px-4 pt-4 pb-3">
				<button
					type="button"
					onClick={onAvatarClick}
					className="relative shrink-0 active:scale-95 transition-transform"
				>
					<div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-primary text-xl font-black text-white shadow-md">
						{firstName?.charAt(0)?.toUpperCase()}
					</div>
					{/* Status dot with ping animation */}
					<div
						className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[2.5px] border-card shadow-sm ${
							isWorking ? "bg-emerald-500" : "bg-muted-foreground/50"
						}`}
					>
						{isWorking && (
							<span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
						)}
					</div>
				</button>

				<div className="flex-1 min-w-0">
					<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/60 leading-none mb-0.5">
						{storeName}
					</p>
					<h2 className="text-base font-black tracking-tight text-foreground leading-tight truncate">
						{greeting}, {firstName}
					</h2>
					<div className="flex flex-wrap items-center gap-1.5 mt-1">
						<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-primary">
							{userRoleName || "Staff"}
						</span>
						<span
							className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] transition-colors ${
								isWorking
									? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
									: "bg-muted/80 text-muted-foreground"
							}`}
						>
							<span
								className={`h-1.5 w-1.5 rounded-full ${
									isWorking ? "bg-emerald-500" : "bg-muted-foreground/50"
								}`}
							/>
							{isWorking ? "Bertugas" : "Off Duty"}
						</span>
					</div>
				</div>
			</div>

			{/* Face ID warning strip */}
			{!hasFaceDescriptor && (
				<motion.div
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-2"
				>
					<Camera className="h-3.5 w-3.5 text-sky-600 shrink-0" />
					<p className="text-[10px] font-bold text-sky-700 dark:text-sky-400">
						Face ID belum aktif — lengkapi untuk akses absensi.
					</p>
				</motion.div>
			)}

			{/* ── STATS: 3-column ── */}
			<div className="mx-4 grid grid-cols-3 divide-x divide-border/40 rounded-2xl border border-border/50 bg-background/60 shadow-sm overflow-hidden">
				{/* Hari ini */}
				<div className="px-2 py-1.5">
					<p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground leading-none">
						Hari Ini
					</p>
					<p className="mt-1 text-sm font-black text-foreground leading-none">
						{workDurationLabel}
					</p>
					<p className="mt-0.5 text-[10px] text-muted-foreground/60">total kerja</p>
				</div>

				{/* Shift */}
				<div className="px-2 py-1.5">
					<p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground leading-none">
						Shift
					</p>
					<p className="mt-1 text-xs font-black text-foreground leading-none line-clamp-1">
						{activeShiftName || "—"}
					</p>
					{activeShiftTime ? (
						<p className="mt-0.5 text-[11px] text-muted-foreground/60">
							{activeShiftTime}
						</p>
					) : (
						<p className="mt-0.5 text-[11px] text-muted-foreground/60">belum ada</p>
					)}
				</div>

				{/* Target */}
				<div className="px-2 py-1.5">
					<p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground leading-none">
						Target
					</p>
					{shiftPct !== null ? (
						<>
							<p
								className={`mt-1 text-sm font-black leading-none ${
									shiftPct >= 100 ? "text-emerald-600" : "text-foreground"
								}`}
							>
								{shiftPct}%
							</p>
							<div className="mt-1 h-0.5 w-full rounded-full bg-muted/50 overflow-hidden">
								<motion.div
									className={`h-full rounded-full ${progressColor}`}
									initial={{ width: 0 }}
									animate={{ width: `${Math.min(100, shiftPct)}%` }}
									transition={{ duration: 0.8, ease: "easeOut" }}
								/>
							</div>
						</>
					) : (
						<>
							<p className="mt-1 text-xs font-black text-muted-foreground/40 leading-none">
								—
							</p>
							<p className="mt-0.5 text-[10px] text-muted-foreground/40">no target</p>
						</>
					)}
				</div>
			</div>

			{/* ── ACTION AREA ── */}
			<div className="px-4 pb-4 pt-3 space-y-2">
				{/* Live datetime */}
				<p className="text-center text-[10px] text-muted-foreground/60 font-medium tracking-wide">
					{dateText}
				</p>

				{/* Primary CTA */}
				<motion.button
					whileTap={{ scale: 0.97 }}
					onClick={onPrimaryAction}
					disabled={isProcessing}
					type="button"
					className={`w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-left shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-70 active:shadow-sm ${ctaBg}`}
				>
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shrink-0">
							{ctaIcon}
						</div>
						<div>
							<p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 leading-none">
								{!hasFaceDescriptor ? "Setup" : "Sesi Kerja"}
							</p>
							<p className="mt-0.5 text-base font-black leading-tight">
								{primaryActionTitle}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						{isWorking && (
							<span className="text-[10px] font-bold opacity-70 mr-1">
								{workDurationLabel}
							</span>
						)}
						<ArrowRight className="h-5 w-5" />
					</div>
				</motion.button>
			</div>
		</motion.div>
	);
}
