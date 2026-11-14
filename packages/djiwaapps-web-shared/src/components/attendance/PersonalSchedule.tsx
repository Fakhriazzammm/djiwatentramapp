import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDaysInMonth, format } from "date-fns";
import { id } from "date-fns/locale";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  Sun,
  Moon,
  Zap,
  Bed,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useHybridAttendanceSchedules } from "../../hooks/use-hybrid-attendance-schedules";
import type { AttendanceSchedule } from "../../hooks/use-hybrid-attendance-schedules";

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const SHIFT_ORDER = ["PAGI", "SORE", "GENERAL", "OFF"];

// ─── Premium Shift Theme ──────────────────────────────────

const SHIFT_THEME: Record<string, { label: string; icon: React.ReactNode; accent: string; bg: string; border: string; text: string; dot: string; badge: string; hex: string }> = {
  PAGI: {
    label: "Pagi",
    icon: <Sun className="h-3.5 w-3.5" />,
    accent: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100/70 dark:bg-emerald-900/30",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500 text-white",
    hex: "#10b981",
  },
  SORE: {
    label: "Sore",
    icon: <Moon className="h-3.5 w-3.5" />,
    accent: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-100/70 dark:bg-sky-900/30",
    border: "border-sky-200/60 dark:border-sky-800/40",
    text: "text-sky-700 dark:text-sky-300",
    dot: "bg-sky-600",
    badge: "bg-sky-500 text-white",
    hex: "#0284c7",
  },
  GENERAL: {
    label: "Cadangan",
    icon: <Zap className="h-3.5 w-3.5" />,
    accent: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100/70 dark:bg-amber-900/30",
    border: "border-amber-200/60 dark:border-amber-800/40",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    badge: "bg-amber-500 text-white",
    hex: "#f59e0b",
  },
  OFF: {
    label: "Libur",
    icon: <Bed className="h-3.5 w-3.5" />,
    accent: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-100/50 dark:bg-slate-800/40",
    border: "border-slate-200/40 dark:border-slate-700/40",
    text: "text-slate-500 dark:text-slate-400",
    dot: "bg-slate-400",
    badge: "bg-slate-400 text-white",
    hex: "#94a3b8",
  },
};

function getShiftLabel(schedule?: AttendanceSchedule): string {
  if (!schedule) return "";
  const shift = schedule.shiftName.toLowerCase();
  if (schedule.status === "off" || shift === "off") return "OFF";
  if (shift.includes("pagi")) return "PAGI";
  if (shift.includes("sore")) return "SORE";
  if (shift.includes("general") || shift.includes("cadangan") || shift.includes("backup")) return "GENERAL";
  return schedule.shiftName.toUpperCase();
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Inline styles for guaranteed 7-column grid
const GRID_7_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: "2px",
};

const CELL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "36px",
  borderRadius: "8px",
  border: "none",
  cursor: "pointer",
  transition: "all 0.15s",
  textAlign: "center",
  position: "relative",
  padding: 0,
  fontFamily: "inherit",
};

const DAY_HEADER_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: "2px",
  marginBottom: "4px",
};

const HEADER_TEXT_STYLE: React.CSSProperties = {
  textAlign: "center",
  fontSize: "8px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  padding: "2px 0",
  color: "#9ca3af",
};

// ─── Avatar Component ──────────────────────────────────────

function Avatar({ name, size = "sm", avatarUrl }: { name: string; size?: "sm" | "md" | "lg"; avatarUrl?: string | null }) {
  const sizeMap = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", sizeMap[size])}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted/70 font-bold text-muted-foreground/70",
        sizeMap[size]
      )}
    >
      👤
    </div>
  );
}

// ─── TeamDayView (Mobile-First Redesign) ──────────────────────

function TeamDayView({
  schedules,
  selectedDate,
  user,
  onPrevDay,
  onNextDay,
}: {
  schedules: AttendanceSchedule[];
  selectedDate: Date;
  user?: { id: string; name: string; role: string } | null;
  onPrevDay: () => void;
  onNextDay: () => void;
}) {
  const isToday = formatDateStr(selectedDate) === formatDateStr(new Date());

  // ── Group by shift ──
  const { shifts } = useMemo(() => {
    const map: Record<string, AttendanceSchedule[]> = {};
    for (const s of schedules) {
      const label = getShiftLabel(s);
      if (!map[label]) map[label] = [];
      map[label]!.push(s);
    }
    const sorted = SHIFT_ORDER.filter((k) => map[k]).map((k) => ({
      shift: k,
      staff: map[k]!,
    }));
    const others = Object.keys(map)
      .filter((k) => !SHIFT_ORDER.includes(k))
      .map((k) => ({ shift: k, staff: map[k]! }));

    return { shifts: [...sorted, ...others] };
  }, [schedules]);

  // ── User's own shift ──
  const mySchedule = useMemo(() => {
    if (!user) return null;
    return schedules.find((s) => s.userId === user.id) ?? null;
  }, [schedules, user]);

  const myLabel = useMemo(() => (mySchedule ? getShiftLabel(mySchedule) : null), [mySchedule]);

  // ── Coworkers (same shift) ──
  const coworkers = useMemo(() => {
    if (!mySchedule) return [];
    return schedules.filter(
      (s) => getShiftLabel(s) === myLabel && s.userId !== user?.id
    );
  }, [schedules, mySchedule, myLabel, user]);

  // ── Active shift tab ──
  const [activeShift, setActiveShift] = useState<string | null>(null);

  useEffect(() => {
    // On mount or schedules change, auto-select: user's shift > largest working > first
    if (shifts.length === 0) {
      setActiveShift(null);
      return;
    }
    if (myLabel && shifts.some((s) => s.shift === myLabel)) {
      setActiveShift(myLabel);
      return;
    }
    const working = shifts.filter((g) => g.shift !== "OFF");
    if (working.length > 0) {
      const largest = working.reduce((a, b) => (a.staff.length >= b.staff.length ? a : b));
      setActiveShift(largest.shift);
      return;
    }
    setActiveShift(shifts[0]!.shift);
  }, [shifts, myLabel]);

  const activeStaff = useMemo(() => {
    const group = shifts.find((g) => g.shift === activeShift);
    return group?.staff ?? [];
  }, [shifts, activeShift]);

  const empty = shifts.length === 0;

  return (
    <div className="space-y-2">
      {/* ── Date Navigation (compact) ── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrevDay}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground shadow-sm transition-all hover:bg-muted active:scale-90"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>

        <div className="flex items-center gap-1.5 truncate text-center">
          <span className="text-[11px] font-bold text-foreground truncate">
            {format(selectedDate, "EEEE, d MMM", { locale: id })}
          </span>
          {isToday && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[7px] font-bold uppercase text-primary">
              Hari ini
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onNextDay}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground shadow-sm transition-all hover:bg-muted active:scale-90"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {empty ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-2 py-8"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/50">
            <CalendarDays className="h-5 w-5 text-muted-foreground/30" />
          </div>
          <p className="text-[12px] font-semibold text-muted-foreground">
            Tidak ada jadwal
          </p>
        </motion.div>
      ) : (
        <>
          {/* ── My Shift Chip ── */}
          {user && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]",
                mySchedule
                  ? "border-emerald-200/60 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-950/15"
                  : "border-border/60 bg-card"
              )}
            >
              <Avatar name={user.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-foreground truncate">
                    {user.name}
                  </span>
                  {mySchedule && (
                    <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  )}
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {mySchedule
                    ? `${myLabel} • ${mySchedule.startTime?.slice(0, 5) ?? ""}${mySchedule.endTime ? `–${mySchedule.endTime.slice(0, 5)}` : ""}`
                    : "Hari ini libur"}
                </span>
              </div>
              {mySchedule && (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/40">
                  {iconByShift[myLabel ?? ""] ?? <Sun className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
                </div>
              )}
            </div>
          )}

          {/* ── Coworkers chip (inline compact) ── */}
          {coworkers.length > 0 && (
            <div className="flex items-center gap-1 px-0.5">
              <Users className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
              <span className="text-[11px] font-semibold text-muted-foreground/70">
                {coworkers.length} rekan satu shift
              </span>
            </div>
          )}

          {/* ── Shift Tab Selector ── */}
          <div className="flex gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] scrollbar-none">
            {shifts.map(({ shift, staff }) => {
              const theme = SHIFT_THEME[shift] ?? SHIFT_THEME.GENERAL!;
              const isActive = activeShift === shift;
              return (
                <motion.button
                  key={shift}
                  type="button"
                  onClick={() => setActiveShift(shift)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 transition-all",
                    isActive
                      ? theme.bg + " " + theme.border + " shadow-sm"
                      : "bg-card border-border/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {iconByShift[shift] ?? <CalendarDays className="h-3 w-3" />}
                  <span className={cn("text-[11px] font-bold", isActive ? theme.text : "")}>
                    {theme.label}
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full text-[7px] font-bold",
                      isActive
                        ? "bg-white/60 dark:bg-foreground/10"
                        : "bg-muted/60"
                    )}
                  >
                    {staff.length}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* ── Active Shift Staff List ── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeShift ?? "none"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]"
            >
              {activeStaff.length === 0 ? (
                <div className="px-3 py-3 text-center">
                  <p className="text-[10px] font-medium text-muted-foreground">Tidak ada staff</p>
                </div>
              ) : (
                <div>
                  {activeStaff.map((s, idx) => (
                    <div
                      key={s._id}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1.5",
                        idx < activeStaff.length - 1 && "border-b border-border/30"
                      )}
                    >
                      <Avatar name={s.userName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-semibold text-foreground truncate">
                            {s.userName}
                          </span>
                          {(activeShift && user?.id === s.userId) && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-1 py-0.5 text-[6px] font-bold text-primary">
                              Anda
                            </span>
                          )}
                          {s.roleName && (
                            <span className="shrink-0 rounded-md bg-muted/70 px-1 py-0.5 text-[7px] font-medium text-muted-foreground">
                              {s.roleName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {s.startTime ? (
                          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground">
                            <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                            {s.startTime.slice(0, 5)}
                            {s.endTime && (
                              <span className="text-muted-foreground/50">–{s.endTime.slice(0, 5)}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-muted-foreground/60">–</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

const iconByShift: Record<string, React.ReactNode> = {
  PAGI: <Sun className="h-3 w-3 text-emerald-500" />,
  SORE: <Moon className="h-3 w-3 text-sky-500" />,
  GENERAL: <Zap className="h-3 w-3 text-amber-500" />,
  OFF: <Bed className="h-3 w-3 text-slate-400" />,
};

// ─── PersonalSchedule ─────────────────────────────────────────

export function PersonalSchedule({
  userId,
  userName,
  userRole,
  month,
  year,
}: {
  userId: string;
  userName?: string;
  userRole?: string;
  month: number;
  year: number;
}) {
  const [mode, setMode] = useState<"personal" | "team">("personal");
  const [selectedDate, setSelectedDate] = useState(() => {
    // Start from the parent's selected period so team mode matches "periode terpilih"
    const d = new Date(year, month - 1, 1);
    // If today is within this period, prefer today for better UX
    const today = new Date();
    if (today.getFullYear() === year && today.getMonth() === month - 1) {
      return today;
    }
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const teamMonth = selectedDate.getMonth() + 1;
  const teamYear = selectedDate.getFullYear();

  // ── Sync selectedDate when parent's period changes ──
  useEffect(() => {
    setSelectedDate((prev) => {
      // Only reset if the parent's period differs from current selectedDate's month/year
      if (prev.getFullYear() !== year || prev.getMonth() !== month - 1) {
        const d = new Date(year, month - 1, 1);
        const today = new Date();
        if (today.getFullYear() === year && today.getMonth() === month - 1) {
          return today;
        }
        return d;
      }
      return prev;
    });
  }, [month, year]);

  const effectiveMonth = mode === "personal" ? month : teamMonth;
  const effectiveYear = mode === "personal" ? year : teamYear;
  const { data: schedulesByDate, isLoading } = useHybridAttendanceSchedules(effectiveMonth, effectiveYear);

  // ── Personal mode ──

  const { days, firstDayOffset } = useMemo(() => {
    if (mode !== "personal") return { days: [] as any[], firstDayOffset: 0 };
    const totalDays = getDaysInMonth(new Date(year, month - 1));
    const offset = new Date(year, month - 1, 1).getDay();
    const today = new Date();
    const result = Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1;
      const dateStr = formatDateStr(new Date(year, month - 1, day));
      const daySchedules = (schedulesByDate?.[dateStr] ?? []).filter(
        (s: AttendanceSchedule) => s.userId === userId
      );
      const isCurrent =
        today.getFullYear() === year &&
        today.getMonth() + 1 === month &&
        today.getDate() === day;
      return {
        day,
        dateStr,
        isToday: isCurrent,
        hasSchedule: daySchedules.length > 0,
        schedule: daySchedules[0] ?? null,
        shiftLabel: getShiftLabel(daySchedules[0]),
      };
    });
    return { days: result, firstDayOffset: offset };
  }, [schedulesByDate, userId, month, year, mode]);

  useEffect(() => {
    if (mode !== "personal") return;
    const todayDay = days.find((d: any) => d.isToday);
    if (todayDay) setSelectedDay(todayDay.day);
  }, [days, mode]);

  const selectedDayData = useMemo(() => {
    if (!selectedDay) return null;
    return days.find((d: any) => d.day === selectedDay) ?? null;
  }, [days, selectedDay]);

  // ── Team mode ──

  const handlePrevDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  }, []);
  const handleNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  }, []);

  const teamSchedules = useMemo(() => {
    if (mode !== "team") return [];
    const dateStr = formatDateStr(selectedDate);
    return schedulesByDate?.[dateStr] ?? [];
  }, [schedulesByDate, selectedDate, mode]);

  // ── Loading ──

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div style={GRID_7_STYLE}>
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="space-y-3">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-[13px] tracking-tight">Jadwal</h3>
        </div>
        <div className="flex items-center rounded-xl border bg-muted/50 p-0.5 gap-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setMode("personal")}
            className={cn(
              "rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all",
              mode === "personal"
                ? "bg-white dark:bg-foreground/10 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Pribadi
          </button>
          <button
            type="button"
            onClick={() => setMode("team")}
            className={cn(
              "rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all",
              mode === "team"
                ? "bg-white dark:bg-foreground/10 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tim
          </button>
        </div>
      </div>

      {mode === "personal" ? (
        <div className="space-y-2">
          {/* Mini calendar grid */}
          <div className="rounded-xl border bg-card p-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
            <div style={DAY_HEADER_STYLE}>
              {DAY_NAMES.map((d, i) => (
                <span
                  key={d}
                  style={{ ...HEADER_TEXT_STYLE, color: i === 0 ? "#f87171" : "#9ca3af" }}
                >
                  {d}
                </span>
              ))}
            </div>
            <div style={GRID_7_STYLE}>
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <div key={`e-${i}`} />
              ))}
              {days.map((d: any) => {
                const colors = d.shiftLabel ? SHIFT_THEME[d.shiftLabel] : null;
                const isSelected = selectedDay === d.day;
                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setSelectedDay(d.day)}
                    style={CELL_STYLE}
                    className={cn(
                      isSelected
                        ? ""
                        : d.hasSchedule && colors
                          ? "hover:opacity-80"
                          : "opacity-40 hover:bg-muted/50"
                    )}
                  >
                    {d.hasSchedule && colors ? (
                      <div
                        className={cn(
                          "flex flex-col items-center gap-px",
                          isSelected && "rounded-[7px] border-2 px-1.5 py-0.5"
                        )}
                        style={isSelected ? { borderColor: colors.hex } : undefined}
                      >
                        <span className={cn(
                          "text-[11px] font-bold leading-none",
                          isSelected ? colors.text : "text-foreground"
                        )}>
                          {d.day}
                        </span>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.hex }} />
                      </div>
                    ) : (
                      isSelected ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[11px] font-bold leading-none text-blue-500 border-2 border-blue-400">
                          {d.day}
                        </span>
                      ) : (
                        <span
                          className="text-[11px] font-bold leading-none"
                          style={{ color: d.isToday ? "#3b82f6" : undefined }}
                        >
                          {d.day}
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day detail — compact & responsive */}
          <AnimatePresence mode="wait">
            {selectedDayData && (
              <motion.div
                key={selectedDayData.day}
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className={cn(
                  "relative overflow-hidden rounded-xl border shadow-[0_1px_3px_-1px_rgba(0,0,0,0.04)]",
                  selectedDayData.schedule
                    ? SHIFT_THEME[selectedDayData.shiftLabel]?.bg ?? "bg-card"
                    : "bg-card"
                )}
              >
                {/* Left accent bar */}
                {selectedDayData.schedule && selectedDayData.shiftLabel && (
                  <div
                    className="absolute left-0 top-0 h-full w-[3px] rounded-r"
                    style={{ backgroundColor: SHIFT_THEME[selectedDayData.shiftLabel]?.hex ?? "#94a3b8" }}
                  />
                )}

                <div className="flex items-center gap-3 px-3 py-2.5">
                  {/* Date badge */}
                  <div className="flex shrink-0 flex-col items-center min-w-0">
                    <span className="text-[18px] font-black text-foreground leading-none">
                      {selectedDayData.day}
                    </span>
                    <span className="text-[7px] font-bold uppercase text-muted-foreground/70 tracking-wider mt-0.5">
                      {DAY_NAMES[new Date(year, month - 1, selectedDayData.day).getDay()]}
                    </span>
                  </div>

                  {selectedDayData.schedule ? (
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "text-[13px] font-black tracking-tight leading-tight block truncate",
                            SHIFT_THEME[selectedDayData.shiftLabel]?.accent ?? "text-foreground"
                          )}
                        >
                          Shift {selectedDayData.shiftLabel}
                        </span>
                        {selectedDayData.schedule.startTime && (
                          <p className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground mt-0.5">
                            <Clock className="h-2.5 w-2.5 shrink-0" />
                            <span>
                              {selectedDayData.schedule.startTime.slice(0, 5)}
                              {selectedDayData.schedule.endTime
                                ? ` — ${selectedDayData.schedule.endTime.slice(0, 5)}`
                                : ""}
                            </span>
                          </p>
                        )}
                      </div>
                      {/* Shift icon badge */}
                      <div
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                          SHIFT_THEME[selectedDayData.shiftLabel]?.bg ?? "bg-muted"
                        )}
                      >
                        {SHIFT_THEME[selectedDayData.shiftLabel]?.icon ?? <CalendarDays className="h-3 w-3" />}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                        <CalendarDays className="h-3 w-3 text-muted-foreground/50" />
                      </div>
                      <p className="text-[10px] font-semibold text-muted-foreground">Tidak ada jadwal</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Legend */}
          <div className="flex items-center gap-2">
            {Object.entries(SHIFT_THEME).map(([label, c]) => (
              <div key={label} className="flex items-center gap-1">
                <div className={c.dot} style={{ width: "6px", height: "6px", borderRadius: "50%" }} />
                <span className="text-[11px] font-bold text-muted-foreground/60 uppercase">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <TeamDayView
          schedules={teamSchedules}
          selectedDate={selectedDate}
          user={userName ? { id: userId, name: userName, role: userRole ?? "" } : null}
          onPrevDay={handlePrevDay}
          onNextDay={handleNextDay}
        />
      )}
    </div>
  );
}
