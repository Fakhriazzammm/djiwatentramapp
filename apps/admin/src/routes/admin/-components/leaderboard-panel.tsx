import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	Trophy,
	Crown,
	Medal,
	TrendingUp,
	ChevronDown,
	ChevronUp,
	Star,
	Users,
	ArrowRight,
	DollarSign,
	Loader2,
	Sparkles,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridShiftReportRows } from "@/hooks/use-hybrid-pos-data";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { Link } from "@tanstack/react-router";

// ── Types ─────────────────────────────────────────────────────────────────

type LeaderboardEntry = {
	name: string;
	roleName: string;
	totalBonus: number;
	shiftCount: number;
	bonusHistory: { shiftName: string; bonus: number; date: string }[];
};

// ── Animation variants ────────────────────────────────────────────────────

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.06 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 12 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { type: "spring", stiffness: 80, damping: 14 },
	},
};

const podiumVariants = {
	hidden: { opacity: 0, scale: 0.85, y: 20 },
	visible: (i: number) => ({
		opacity: 1,
		scale: 1,
		y: 0,
		transition: {
			delay: 0.1 + i * 0.15,
			type: "spring",
			stiffness: 100,
			damping: 12,
		},
	}),
};

const counterVariants = {
	initial: { scale: 0.5, opacity: 0 },
	animate: (i: number) => ({
		scale: 1,
		opacity: 1,
		transition: {
			delay: 0.3 + i * 0.08,
			type: "spring" as const,
			stiffness: 50,
			damping: 10,
		},
	}),
};

// ── Podium colors ─────────────────────────────────────────────────────────

const RANK_COLORS = [
	{
		bg: "from-amber-400 via-amber-300 to-yellow-200",
		badge: "bg-amber-500 text-white",
		icon: "text-amber-500",
		bar: "bg-gradient-to-r from-amber-400 to-yellow-300",
		accent: "text-amber-600",
		shadow: "shadow-amber-200/50",
	},
	{
		bg: "from-slate-300 via-slate-200 to-gray-100",
		badge: "bg-slate-400 text-white",
		icon: "text-slate-400",
		bar: "bg-gradient-to-r from-slate-300 to-gray-200",
		accent: "text-slate-500",
		shadow: "shadow-slate-200/50",
	},
	{
		bg: "from-orange-300 via-amber-200 to-yellow-100",
		badge: "bg-orange-400 text-white",
		icon: "text-orange-400",
		bar: "bg-gradient-to-r from-orange-300 to-amber-200",
		accent: "text-orange-500",
		shadow: "shadow-orange-200/50",
	},
];

// ── Aggregator ────────────────────────────────────────────────────────────

function isThisMonth(timestamp: number): boolean {
	const now = new Date();
	const d = new Date(timestamp);
	return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function buildLeaderboard(
	shifts: any[],
): LeaderboardEntry[] {
	// Only include shifts from the current month
	const monthShifts = shifts.filter((s: any) => s.startTime && isThisMonth(s.startTime));
	const memberMap = new Map<
		string,
		{
			name: string;
			roleName: string;
			totalBonus: number;
			shiftCount: number;
			bonusHistory: { shiftName: string; bonus: number; date: string }[];
		}
	>();

	for (const shift of monthShifts) {
		const bonuses = shift.memberBonuses ?? [];
		for (const mb of bonuses) {
			if (mb.bonus <= 0) continue;
			// Skip Manajer — leaderboard khusus staff non-manajerial
			const role = (mb.roleName ?? "").toLowerCase();
			if (role.includes("manajer") || role.includes("manager")) continue;
			const existing = memberMap.get(mb.name) ?? {
				name: mb.name,
				roleName: mb.roleName,
				totalBonus: 0,
				shiftCount: 0,
				bonusHistory: [],
			};
			existing.totalBonus += mb.bonus;
			existing.shiftCount += 1;
			existing.bonusHistory.push({
				shiftName: shift.shiftName ?? "Shift",
				bonus: mb.bonus,
				date: shift.startTime
					? new Date(shift.startTime).toLocaleDateString("id-ID", {
							day: "numeric",
							month: "short",
						})
					: "",
			});
			memberMap.set(mb.name, existing);
		}
	}

	return [...memberMap.values()]
		.sort((a, b) => b.totalBonus - a.totalBonus)
		.slice(0, 15);
}

// ── Animated Number ───────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
	const display = formatCurrencyIDR(value);
	return (
		<span className="tabular-nums">{display}</span>
	);
}

// ── Trophy Icon ───────────────────────────────────────────────────────────

function RankIcon({ rank }: { rank: number }) {
	if (rank === 0) return <Crown className="h-4 w-4 text-amber-500" />;
	if (rank === 1) return <Medal className="h-4 w-4 text-slate-400" />;
	if (rank === 2) return <Medal className="h-4 w-4 text-orange-400" />;
	return <span className="text-[10px] font-bold text-muted-foreground w-4 text-center">{rank + 1}</span>;
}

// ── Podium Card ───────────────────────────────────────────────────────────

function PodiumCard({
	entry,
	rank,
	maxBonus,
}: {
	entry: LeaderboardEntry;
	rank: number;
	maxBonus: number;
}) {
	const c = RANK_COLORS[rank] ?? RANK_COLORS[2];
	const barPct = maxBonus > 0 ? (entry.totalBonus / maxBonus) * 100 : 0;

	return (
		<motion.div
			custom={rank}
			variants={podiumVariants}
			initial="hidden"
			animate="visible"
			className={`relative flex flex-col items-center rounded-xl border border-border bg-card p-3 transition-all hover:shadow-lg ${c.shadow} hover:scale-[1.02] cursor-pointer group`}
		>
			{/* Trophy / Crown */}
			<div className={`absolute -top-3 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full ${c.badge} shadow-md`}>
				{rank === 0 ? <Crown className="h-3.5 w-3.5" /> : rank === 1 ? <Medal className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
			</div>

			{/* Avatar placeholder */}
			<div className={`mt-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${c.bg} shadow-sm`}>
				<span className="text-sm font-bold text-white drop-shadow-sm">
					{entry.name.charAt(0).toUpperCase()}
				</span>
			</div>

			{/* Name */}
			<p className="mt-2 text-[11px] font-bold text-foreground truncate max-w-full text-center leading-tight">
				{entry.name}
			</p>

			{/* Role */}
			<p className="text-[8px] font-medium text-muted-foreground truncate max-w-full">{entry.roleName}</p>

			{/* Bonus amount */}
			<motion.p
				custom={rank}
				variants={counterVariants}
				initial="initial"
				animate="animate"
				className={`mt-2 text-sm font-extrabold ${c.accent}`}
			>
				{formatCurrencyIDR(entry.totalBonus)}
			</motion.p>

			{/* Progress bar */}
			<div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
				<motion.div
					className={`h-full rounded-full ${c.bar} shadow-sm`}
					initial={{ width: 0 }}
					animate={{ width: `${barPct}%` }}
					transition={{ delay: 0.4 + rank * 0.15, duration: 0.8, ease: "easeOut" }}
				/>
			</div>

			{/* Shift count */}
			<p className="mt-1 text-[8px] text-muted-foreground flex items-center gap-1">
				<Users className="h-2.5 w-2.5" />
				{entry.shiftCount} shift
			</p>

			{/* Sparkle effect */}
			{rank === 0 && (
				<motion.div
					className="absolute -top-1 -right-1"
					animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
					transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
				>
					<Sparkles className="h-4 w-4 text-amber-400" />
				</motion.div>
			)}
		</motion.div>
	);
}

// ── Leaderboard Row ───────────────────────────────────────────────────────

function LeaderboardRow({
	entry,
	rank,
	maxBonus,
}: {
	entry: LeaderboardEntry;
	rank: number;
	maxBonus: number;
}) {
	const [expanded, setExpanded] = useState(false);
	const barPct = maxBonus > 0 ? (entry.totalBonus / maxBonus) * 100 : 0;
	const top3 = rank < 3;
	const c = top3 ? RANK_COLORS[rank] : null;

	return (
		<motion.div
			variants={itemVariants}
			className={`rounded-lg border ${top3 ? "border-primary/10 bg-primary/[0.02]" : "border-border bg-card"} p-2 transition-all hover:bg-muted/50 cursor-pointer`}
			onClick={() => setExpanded(!expanded)}
		>
			<div className="flex items-center gap-2">
				{/* Rank */}
				<div
					className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
						top3 ? c!.badge : "bg-muted"
					} shadow-sm`}
				>
					<RankIcon rank={rank} />
				</div>

				{/* Avatar */}
				<div
					className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
						top3 ? `bg-gradient-to-br ${c!.bg}` : "bg-muted"
					}`}
				>
					<span className={`text-[10px] font-bold ${top3 ? "text-white drop-shadow-sm" : "text-muted-foreground"}`}>
						{entry.name.charAt(0).toUpperCase()}
					</span>
				</div>

				{/* Name + role */}
				<div className="flex-1 min-w-0">
					<p className="text-[11px] font-bold text-foreground truncate leading-tight">
						{entry.name}
					</p>
					<p className="text-[8px] text-muted-foreground truncate">{entry.roleName}</p>
				</div>

				{/* Shift count */}
				<div className="hidden sm:flex items-center gap-1 text-[9px] text-muted-foreground">
					<Users className="h-3 w-3" />
					<span className="font-medium">{entry.shiftCount}</span>
				</div>

				{/* Bonus */}
				<div className="text-right shrink-0 min-w-[80px]">
					<motion.p
						custom={rank}
						variants={counterVariants}
						initial="initial"
						animate="animate"
						className={`text-[11px] font-extrabold ${top3 ? c!.accent : "text-foreground"}`}
					>
						<AnimatedNumber value={entry.totalBonus} />
					</motion.p>
				</div>

				{/* Expand */}
				<button className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
					{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
				</button>
			</div>

			{/* Progress bar */}
			<div className="mt-1.5 w-full h-1 rounded-full bg-muted overflow-hidden">
				<motion.div
					className={`h-full rounded-full ${
						top3 ? c!.bar : "bg-gradient-to-r from-primary/50 to-primary/30"
					}`}
					initial={{ width: 0 }}
					animate={{ width: `${barPct}%` }}
					transition={{ delay: 0.3 + rank * 0.04, duration: 0.6, ease: "easeOut" }}
				/>
			</div>

			{/* Expanded bonus history */}
			<AnimatePresence>
				{expanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						<div className="mt-2 pt-2 border-t border-border/40 space-y-1">
							{entry.bonusHistory.length === 0 ? (
								<p className="text-[9px] text-muted-foreground italic">Belum ada histori bonus</p>
							) : (
								entry.bonusHistory.map((h, i) => (
									<div key={i} className="flex items-center justify-between text-[9px]">
										<div className="flex items-center gap-1.5 min-w-0">
											<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
											<span className="text-muted-foreground truncate">{h.shiftName}</span>
											<span className="text-muted-foreground/60 shrink-0">• {h.date}</span>
										</div>
										<span className="font-semibold text-emerald-600 shrink-0 ml-2">
											+{formatCurrencyIDR(h.bonus, true)}
										</span>
									</div>
								))
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

// ── Main Component ────────────────────────────────────────────────────────

export function LeaderboardPanel() {
	const shifts = useHybridShiftReportRows();

	const leaderboard = useMemo(() => {
		if (!shifts) return undefined;
		// Only completed shifts with bonuses
		const completedShifts = shifts.filter((s: any) => s.status === "SELESAI");
		return buildLeaderboard(completedShifts);
	}, [shifts]);

	const maxBonus = leaderboard && leaderboard.length > 0
		? leaderboard[0].totalBonus
		: 0;

	const top3 = leaderboard?.slice(0, 3) ?? [];
	const rest = leaderboard?.slice(3) ?? [];

	if (leaderboard === undefined) {
		return (
			<div className="rounded-xl border border-border bg-card p-3">
				<div className="flex items-center gap-2 mb-3">
					<Skeleton className="h-4 w-4 rounded" />
					<Skeleton className="h-3 w-36 rounded" />
				</div>
				<div className="space-y-2">
					{Array.from({ length: 5 }).map((_, i) => (
						<Skeleton key={i} className="h-10 w-full rounded-lg" />
					))}
				</div>
			</div>
		);
	}

	if (leaderboard.length === 0) {
		return (
			<div className="rounded-xl border border-border bg-card p-3">
				<div className="flex items-center justify-between mb-2">
					<h3 className="text-xs font-bold flex items-center gap-1.5">
						<Trophy className="w-3.5 h-3.5 text-primary" />
						Leaderboard Bonus Shift
					</h3>
				</div>
				<div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20 rounded-lg border border-dashed border-border">
					<Trophy className="w-10 h-10 text-muted-foreground/30 mb-2" />
					<p className="text-muted-foreground text-[10px] font-medium">Belum ada bonus shift diberikan</p>
					<p className="text-muted-foreground/60 text-[9px] mt-1">Atur target shift untuk mulai memberikan bonus</p>
				</div>
			</div>
		);
	}

	return (
		<motion.div
			className="rounded-xl border border-border bg-card p-3"
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4 }}
		>
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<div>
					<h3 className="text-xs font-bold flex items-center gap-1.5">
						<Trophy className="w-3.5 h-3.5 text-primary" />
						Leaderboard Bonus Shift
					</h3>
					<p className="text-[9px] text-muted-foreground mt-0.5">
						Karyawan dengan akumulasi bonus terbanyak
					</p>
				</div>
				<Link
					to="/admin/finance/shift-reports"
					className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[9px] font-bold text-primary hover:bg-primary/20 transition-all"
				>
					Lihat Semua
					<ArrowRight className="h-3 w-3" />
				</Link>
			</div>

			{/* Podium — Top 3 */}
			{top3.length >= 2 && (
				<div className="grid grid-cols-3 gap-2 mb-3">
					{/* #2 (left) */}
					{top3[1] && <PodiumCard entry={top3[1]} rank={1} maxBonus={maxBonus} />}
					{/* #1 (center, bigger visual weight) */}
					{top3[0] && (
						<div className="scale-105 origin-center">
							<PodiumCard entry={top3[0]} rank={0} maxBonus={maxBonus} />
						</div>
					)}
					{/* #3 (right) */}
					{top3[2] && <PodiumCard entry={top3[2]} rank={2} maxBonus={maxBonus} />}
				</div>
			)}

			{/* If only 1 person has bonuses, show single highlight */}
			{top3.length === 1 && (
				<div className="flex justify-center mb-3">
					<div className="w-1/2">
						<PodiumCard entry={top3[0]} rank={0} maxBonus={maxBonus} />
					</div>
				</div>
			)}

			{/* Leaderboard List */}
			<motion.div
				className="space-y-1.5"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				{rest.map((entry, i) => (
					<LeaderboardRow
						key={entry.name}
						entry={entry}
						rank={i + 3}
						maxBonus={maxBonus}
					/>
				))}
			</motion.div>
		</motion.div>
	);
}
