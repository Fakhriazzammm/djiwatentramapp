import { useState, useMemo, useEffect, useCallback } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Crown, Medal, Star, TrendingUp, ChevronDown, ChevronUp,
  Users, ArrowLeft, Loader2, Sparkles, DollarSign,
} from "lucide-react";
import { createClient } from "@yumipos/web-shared/lib/client";
import { Skeleton } from "@yumipos/web-shared";
import { useStaffProfile } from "../$username.lazy";

// ── Inline formatter ──────────────────────────────────────────────────

function fmtIDR(amount: number, short = false): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: short ? 0 : 0,
    maximumFractionDigits: short ? 0 : 0,
  }).format(amount);
}

// ── Types ─────────────────────────────────────────────────────────────

type BonusEntry = {
  name: string;
  roleName: string;
  totalBonus: number;
  shiftCount: number;
  bonusHistory: { shiftName: string; bonus: number; date: string }[];
};

type ShiftRow = {
  source_id: string;
  shift_name: string;
  cashier_name: string;
  team_members: string;
  start_time: number;
  end_time: number | null;
  raw: any;
};

// ── Animations ────────────────────────────────────────────────────────

const containerVariants: any = {
  hidden: { opacity: 0 },
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 12 },
  visible: { transition: { type: "spring", stiffness: 80, damping: 14 } },
};

const podiumVariants: any = {
  hidden: { opacity: 0, scale: 0.85, y: 20 },
  visible: (i: number) => ({
    opacity: 1, scale: 1, y: 0,
    transition: { delay: 0.1 + i * 0.15, type: "spring", stiffness: 100, damping: 12 },
  }),
};

const counterVariants: any = {
  initial: { scale: 0.5, opacity: 0 },
  animate: (i: number) => ({
    scale: 1, opacity: 1,
    transition: { delay: 0.3 + i * 0.08, type: "spring", stiffness: 50, damping: 10 },
  }),
};

// ── Podium colors ─────────────────────────────────────────────────────

const RANK_COLORS = [
  {
    bg: "from-amber-400 via-amber-300 to-yellow-200",
    badge: "bg-amber-500 text-white",
    bar: "bg-gradient-to-r from-amber-400 to-yellow-300",
    accent: "text-amber-600",
    shadow: "shadow-amber-200/50",
  },
  {
    bg: "from-slate-300 via-slate-200 to-gray-100",
    badge: "bg-slate-400 text-white",
    bar: "bg-gradient-to-r from-slate-300 to-gray-200",
    accent: "text-slate-500",
    shadow: "shadow-slate-200/50",
  },
  {
    bg: "from-orange-300 via-amber-200 to-yellow-100",
    badge: "bg-orange-400 text-white",
    bar: "bg-gradient-to-r from-orange-300 to-amber-200",
    accent: "text-orange-500",
    shadow: "shadow-orange-200/50",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────

function isThisMonth(ts: number): boolean {
  const now = new Date();
  const d = new Date(ts);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function parseMemberBonuses(raw: any): BonusEntry[] {
  if (!raw) return [];
  let memberBonuses: any[] = [];
  if (typeof raw.memberBonuses === "string") {
    try { memberBonuses = JSON.parse(raw.memberBonuses); } catch { /* */ }
  } else if (Array.isArray(raw.memberBonuses)) {
    memberBonuses = raw.memberBonuses;
  }
  return memberBonuses.map((mb: any) => ({
    name: mb.name ?? "—",
    roleName: mb.roleName ?? "—",
    totalBonus: mb.bonus ?? 0,
    shiftCount: 1,
    bonusHistory: [{ shiftName: mb.shiftName ?? "Shift", bonus: mb.bonus ?? 0, date: "" }],
  }));
}

function aggregateBonuses(shifts: ShiftRow[]): BonusEntry[] {
  const memberMap = new Map<string, BonusEntry>();

  for (const shift of shifts) {
    if (!shift.start_time || !isThisMonth(shift.start_time)) continue;
    if (!shift.end_time) continue; // only completed shifts

    const bonuses = parseMemberBonuses(shift.raw);
    for (const b of bonuses) {
      if (b.totalBonus <= 0) continue;

      const existing = memberMap.get(b.name) ?? {
        name: b.name,
        roleName: b.roleName,
        totalBonus: 0,
        shiftCount: 0,
        bonusHistory: [],
      };

      existing.totalBonus += b.totalBonus;
      existing.shiftCount += 1;
      existing.bonusHistory.push({
        shiftName: shift.shift_name ?? "Shift",
        bonus: b.totalBonus,
        date: new Date(shift.start_time).toLocaleDateString("id-ID", {
          day: "numeric", month: "short",
        }),
      });

      // Ambil roleName dari bonus jika belum ada
      if (existing.roleName === "—" && b.roleName !== "—") {
        existing.roleName = b.roleName;
      }

      memberMap.set(b.name, existing);
    }
  }

  return [...memberMap.values()]
    .sort((a, b) => b.totalBonus - a.totalBonus);
}

// ── Sub-components ────────────────────────────────────────────────────

function RankIcon({ rank }: { rank: number }) {
  if (rank === 0) return <Crown className="h-4 w-4 text-amber-500" />;
  if (rank === 1) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-orange-400" />;
  return <span className="text-[10px] font-bold text-muted-foreground w-4 text-center">{rank + 1}</span>;
}

function PodiumCard({ entry, rank, maxBonus, isMe }: {
  entry: BonusEntry; rank: number; maxBonus: number; isMe: boolean;
}) {
  const c = RANK_COLORS[rank] ?? RANK_COLORS[2];
  const barPct = maxBonus > 0 ? (entry.totalBonus / maxBonus) * 100 : 0;

  return (
    <motion.div
      custom={rank}
      variants={podiumVariants}
      initial="hidden"
      animate="visible"
      className={`karyawan-card relative flex min-w-0 flex-col items-center border bg-card p-3 transition-all ${c.shadow} ${isMe ? "ring-2 ring-primary ring-offset-1" : ""}`}
    >
      <div className={`absolute -top-3 left-1/2 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-full ${c.badge} shadow-md`}>
        {rank === 0 ? <Crown className="h-3.5 w-3.5" /> : rank === 1 ? <Medal className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
      </div>

      <div className={`mt-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${c.bg} shadow-sm`}>
        <span className="text-sm font-bold text-white drop-shadow-sm">
          {entry.name.charAt(0).toUpperCase()}
        </span>
      </div>

      <p className="mt-2 max-w-full text-center text-[11px] font-bold leading-tight text-foreground [overflow-wrap:anywhere]">
        {entry.name} {isMe && <span className="text-[10px] text-primary font-bold">(Kamu)</span>}
      </p>
      <p className="text-[10px] font-medium text-muted-foreground truncate max-w-full">{entry.roleName}</p>

      <motion.p
        custom={rank}
        variants={counterVariants}
        initial="initial"
        animate="animate"
        className={`mt-2 text-sm font-extrabold ${c.accent}`}
      >
        {fmtIDR(entry.totalBonus)}
      </motion.p>

      <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${c.bar} shadow-sm`}
          initial={{ width: 0 }}
          animate={{ width: `${barPct}%` }}
          transition={{ delay: 0.4 + rank * 0.15, duration: 0.8, ease: "easeOut" }}
        />
      </div>

      <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
        <Users className="h-2.5 w-2.5" />
        {entry.shiftCount} shift
      </p>

      {rank === 0 && (
        <div className="absolute -right-1 -top-1">
          <Sparkles className="h-4 w-4 text-amber-400" />
        </div>
      )}
    </motion.div>
  );
}

function LeaderboardRow({ entry, rank, maxBonus, isMe }: {
  entry: BonusEntry; rank: number; maxBonus: number; isMe: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const barPct = maxBonus > 0 ? (entry.totalBonus / maxBonus) * 100 : 0;
  const top3 = rank < 3;
  const c = top3 ? RANK_COLORS[rank] : null;

  return (
    <motion.div
      variants={itemVariants}
      className={`rounded-lg border p-2 transition-all cursor-pointer group ${
        isMe
          ? "border-primary/30 bg-primary/[0.04]"
          : top3
          ? "border-primary/10 bg-primary/[0.02]"
          : "border-border bg-card"
      } hover:bg-muted/50 hover:border-primary/20`}
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpanded(!expanded); } }}
    >
      <div className="flex items-center gap-2">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${top3 ? c!.badge : "bg-muted"} shadow-sm`}>
          <RankIcon rank={rank} />
        </div>

        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          top3 ? `bg-gradient-to-br ${c!.bg}` : "bg-muted"
        }`}>
          <span className={`text-[10px] font-bold ${top3 ? "text-white drop-shadow-sm" : "text-muted-foreground"}`}>
            {entry.name.charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-foreground truncate leading-tight">
            {entry.name}
            {isMe && <span className="ml-1 text-[10px] bg-primary/10 text-primary font-bold px-1 py-0.5 rounded">Kamu</span>}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">{entry.roleName}</p>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" />
          <span className="font-medium">{entry.shiftCount}</span>
        </div>

        <div className="text-right shrink-0 min-w-[80px]">
          <motion.p
            custom={rank}
            variants={counterVariants}
            initial="initial"
            animate="animate"
            className={`text-[11px] font-extrabold ${top3 ? c!.accent : "text-foreground"}`}
          >
            {fmtIDR(entry.totalBonus)}
          </motion.p>
        </div>

        <div className="shrink-0 flex items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
          <span className="text-[10px] hidden group-hover:inline text-primary/60">Detail</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </div>

      <div className="mt-1.5 w-full h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${top3 ? c!.bar : "bg-primary/40"}`}
          initial={{ width: 0 }}
          animate={{ width: `${barPct}%` }}
          transition={{ delay: 0.3 + rank * 0.04, duration: 0.6, ease: "easeOut" }}
        />
      </div>

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
                <p className="text-[11px] text-muted-foreground italic">Belum ada histori bonus</p>
              ) : (
                entry.bonusHistory.map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-muted-foreground truncate">{h.shiftName}</span>
                      <span className="text-muted-foreground/60 shrink-0">• {h.date}</span>
                    </div>
                    <span className="font-semibold text-emerald-600 shrink-0 ml-2">
                      +{fmtIDR(h.bonus, true)}
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

// ── Loading / Empty states ────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5 rounded-lg" />
        <Skeleton className="h-4 w-44 rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Trophy className="w-12 h-12 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-bold text-muted-foreground">Belum ada bonus shift bulan ini</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Leaderboard akan muncul setelah shift selesai</p>
    </div>
  );
}

// ── Page Component ────────────────────────────────────────────────────

export const Route = createLazyFileRoute("/$username/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const navigate = useNavigate();
  const { staff, username } = useStaffProfile();
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const startTs = monthStart.getTime();

        const { data } = await supabase
          .schema("pos")
          .from("shifts")
          .select("source_id,shift_name,cashier_name,team_members,start_time,end_time,raw")
          .not("start_time", "is", null)
          .not("end_time", "is", null)
          .gte("start_time", startTs)
          .order("start_time", { ascending: false });

        if (!cancelled) {
          setShifts((data ?? []) as ShiftRow[]);
        }
      } catch (e) {
        console.error("[leaderboard] fetch error", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const leaderboard = useMemo(() => aggregateBonuses(shifts), [shifts]);
  const maxBonus = leaderboard.length > 0 ? leaderboard[0].totalBonus : 0;
  const currentUserName = staff?.name ?? "";

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  const currentUserRank = leaderboard.findIndex((e) => e.name === currentUserName);
  const currentUserEntry = currentUserRank >= 0 ? leaderboard[currentUserRank] : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/$username/beranda" as any, params: { username } })}
          aria-label="Kembali ke beranda"
          className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-card shadow-sm hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shadow-sm">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Leaderboard Bonus</h1>
            <p className="text-[11px] font-medium text-muted-foreground">Bulan {new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : leaderboard.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Podium - Top 3 */}
          {top3.length >= 2 && (
            <div className="grid grid-cols-3 gap-2">
              {top3[1] && <PodiumCard entry={top3[1]} rank={1} maxBonus={maxBonus} isMe={top3[1].name === currentUserName} />}
              {top3[0] && (
                <div className="scale-105 origin-center">
                  <PodiumCard entry={top3[0]} rank={0} maxBonus={maxBonus} isMe={top3[0].name === currentUserName} />
                </div>
              )}
              {top3[2] && <PodiumCard entry={top3[2]} rank={2} maxBonus={maxBonus} isMe={top3[2].name === currentUserName} />}
            </div>
          )}

          {top3.length === 1 && (
            <div className="flex justify-center">
              <div className="w-1/2">
                <PodiumCard entry={top3[0]} rank={0} maxBonus={maxBonus} isMe={top3[0].name === currentUserName} />
              </div>
            </div>
          )}

          {/* Full list */}
          <motion.div className="space-y-1.5" variants={containerVariants} initial="hidden" animate="visible">
            {rest.map((entry, i) => (
              <LeaderboardRow
                key={entry.name}
                entry={entry}
                rank={i + 3}
                maxBonus={maxBonus}
                isMe={entry.name === currentUserName}
              />
            ))}
          </motion.div>

          {/* Rank outside leaderboard */}
          {currentUserRank < 0 && !loading && (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
              <p className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Kamu belum memiliki bonus bulan ini. Tetap semangat!
              </p>
            </div>
          )}

          {/* Summary bar */}
          {currentUserEntry && currentUserRank >= 3 && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
              <p className="text-[10px] font-bold text-muted-foreground">Peringkatmu</p>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                    #{currentUserRank + 1}
                  </span>
                  <span className="text-sm font-bold">{currentUserEntry.name}</span>
                </div>
                <span className="text-sm font-extrabold text-primary">
                  {fmtIDR(currentUserEntry.totalBonus)}
                </span>
              </div>
              <div className="mt-1.5 w-full h-1 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${maxBonus > 0 ? (currentUserEntry.totalBonus / maxBonus) * 100 : 0}%` }}
                  transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
