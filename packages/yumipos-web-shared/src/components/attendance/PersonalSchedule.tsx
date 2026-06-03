import { useState, useMemo, useEffect, useCallback } from "react";
import { getDaysInMonth, format } from "date-fns";
import { id } from "date-fns/locale";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  Sun,
  Moon,
  Star,
  Zap,
  Bed,
  UserCheck,
  UserX,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useHybridAttendanceSchedules } from "../../hooks/use-hybrid-attendance-schedules";
import type { AttendanceSchedule } from "../../hooks/use-hybrid-attendance-schedules";

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const SHIFT_ORDER = ["PAGI", "SORE", "GENERAL", "OFF"];

// ─── Premium Shift Theme ──────────────────────────────────

const SHIFT_THEME: Record<string, { label: string; icon: React.ReactNode; accent: string; bg: string; border: string; text: string; dot: string; badge: string }> = {
  PAGI: {
    label: "Pagi",
    icon: <Sun className="h-3.5 w-3.5" />,
    accent: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100/70 dark:bg-emerald-900/30",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500 text-white",
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

function getStaffingStatus(count: number): { label: string; icon: React.ReactNode; color: string } {
  if (count >= 3) return { label: "Tersedia", icon: <UserCheck className="h-3 w-3" />, color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30" };
  if (count >= 1) return { label: "Kurang", icon: <AlertTriangle className="h-3 w-3" />, color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30" };
  return { label: "Tidak Ada", icon: <UserX className="h-3 w-3" />, color: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30" };
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

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizeMap = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary font-bold text-primary-foreground",
        sizeMap[size]
      )}
    >
      {(name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

// ─── Employee Row ──────────────────────────────────────────

function EmployeeRow({
  schedule,
  isSelf,
  noBorder,
}: {
  schedule: AttendanceSchedule;
  isSelf?: boolean;
  noBorder?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 transition-colors",
        isSelf && "bg-primary/[0.04]",
        !noBorder && "border-b border-border/40 last:border-b-0"
      )}
    >
      {/* Avatar */}
      <Avatar name={schedule.userName} size="md" />

      {/* Name + Role */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-foreground leading-tight truncate">
            {schedule.userName}
          </span>
          {isSelf && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold text-primary">
              <Star className="h-2.5 w-2.5 fill-primary" /> Anda
            </span>
          )}
        </div>
        {schedule.roleName && (
          <span className="inline-block rounded-md bg-muted/70 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground mt-0.5">
            {schedule.roleName}
          </span>
        )}
      </div>

      {/* Shift Time */}
      <div className="shrink-0 text-right">
        {schedule.startTime ? (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Clock className="h-3 w-3 text-muted-foreground/60" />
            <span>
              {schedule.startTime.slice(0, 5)}
              {schedule.endTime ? <span className="text-muted-foreground/50">–{schedule.endTime.slice(0, 5)}</span> : ""}
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-medium text-muted-foreground/60">–</span>
        )}
      </div>
    </div>
  );
}

// ─── Shift Section ─────────────────────────────────────────

function ShiftSection({
  shiftLabel,
  staff,
  isExpanded,
  onToggle,
}: {
  shiftLabel: string;
  staff: AttendanceSchedule[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const theme = (SHIFT_THEME[shiftLabel] ?? SHIFT_THEME.GENERAL)!;
  const staffing = getStaffingStatus(staff.length);
  const currentUserId = (staff[0] as any)?.currentUserId;

  // Get shift times from first schedule with times
  const firstWithTime = staff.find((s) => s.startTime);
  const shiftTime = firstWithTime?.startTime
    ? `${firstWithTime.startTime.slice(0, 5)}${firstWithTime.endTime ? `–${firstWithTime.endTime.slice(0, 5)}` : ""}`
    : null;

  const iconMap: Record<string, React.ReactNode> = {
    PAGI: <Sun className="h-4 w-4 text-emerald-500" />,
    SORE: <Moon className="h-4 w-4 text-sky-500" />,
    GENERAL: <Zap className="h-4 w-4 text-amber-500" />,
    OFF: <Bed className="h-4 w-4 text-slate-400" />,
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 transition-colors hover:bg-muted/20 active:scale-[0.99]"
      >
        {/* Shift Icon */}
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", theme.bg)}>
          {iconMap[shiftLabel] ?? <CalendarDays className="h-4 w-4" />}
        </div>

        {/* Shift Info */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-bold", theme.text)}>{theme.label}</span>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
              {staff.length}
            </span>
          </div>
          {shiftTime && (
            <p className="text-[11px] font-medium text-muted-foreground/70">{shiftTime}</p>
          )}
        </div>

        {/* Staffing Status */}
        <div className={cn("hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold", staffing.color)}>
          {staffing.icon}
          <span>{staffing.label}</span>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground/50 transition-transform duration-200",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {/* Staff List */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-[999px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className={cn("border-t border-border/40", theme.bg)}>
          {staff.map((s) => (
            <EmployeeRow
              key={s._id}
              schedule={s}
              isSelf={Boolean(currentUserId && s.userId === currentUserId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TeamDayView ──────────────────────────────────────────────

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
  const { shifts, totalStaff, workingToday, offDuty } = useMemo(() => {
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

    const all = [...sorted, ...others];
    const working = all
      .filter((g) => g.shift !== "OFF")
      .reduce((sum, g) => sum + g.staff.length, 0);
    const off = all
      .filter((g) => g.shift === "OFF")
      .reduce((sum, g) => sum + g.staff.length, 0);

    return { shifts: all, totalStaff: schedules.length, workingToday: working, offDuty: off };
  }, [schedules]);

  // ── User's own shift ──
  const mySchedule = useMemo(() => {
    if (!user) return null;
    return schedules.find((s) => s.userId === user.id) ?? null;
  }, [schedules, user]);

  // ── Coworkers (same shift as user) ──
  const coworkers = useMemo(() => {
    if (!mySchedule) return [];
    const myLabel = getShiftLabel(mySchedule);
    return schedules.filter(
      (s) => getShiftLabel(s) === myLabel && s.userId !== user?.id
    );
  }, [schedules, mySchedule, user]);

  // ── Expand state ──
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(() => {
    if (shifts.length === 0) return new Set();
    // Auto-expand largest working shift, or user's shift
    const working = shifts.filter((g) => g.shift !== "OFF");
    if (working.length === 0 && shifts.length > 0) return new Set([shifts[0]!.shift]);
    const largest = working.reduce((a, b) => (a.staff.length >= b.staff.length ? a : b));
    return new Set([largest.shift]);
  });

  const toggleShift = useCallback((shift: string) => {
    setExpandedShifts((prev) => {
      const next = new Set(prev);
      if (next.has(shift)) next.delete(shift);
      else next.add(shift);
      return next;
    });
  }, []);

  // Auto-expand user's shift
  useEffect(() => {
    if (mySchedule) {
      const myLabel = getShiftLabel(mySchedule);
      setExpandedShifts((prev) => {
        if (prev.has(myLabel)) return prev;
        const next = new Set(prev);
        next.add(myLabel);
        return next;
      });
    }
  }, [mySchedule]);

  const empty = shifts.length === 0;

  return (
    <div className="space-y-3">
      {/* ── Date Navigation ── */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={onPrevDay}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-card text-muted-foreground shadow-sm transition-all hover:bg-muted active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[13px] font-bold text-foreground">
            {format(selectedDate, "EEEE", { locale: id })}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {format(selectedDate, "d MMMM yyyy", { locale: id })}
            {isToday && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold text-primary uppercase">
                Hari ini
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={onNextDay}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-card text-muted-foreground shadow-sm transition-all hover:bg-muted active:scale-95"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── "Shift Saya Hari Ini" Card ── */}
      {user && (
        <div
          className={cn(
            "overflow-hidden rounded-2xl border shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)] transition-all",
            mySchedule
              ? "border-emerald-200/70 dark:border-emerald-800/40"
              : "border-border/60"
          )}
        >
          {mySchedule ? (
            <div className="relative bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/15 dark:to-card px-4 py-3.5">
              {/* Decorative accent bar */}
              <div className="absolute left-0 top-0 h-full w-0.5 bg-emerald-500 rounded-r" />

              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                  <Sun className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Shift Saya Hari Ini
                </span>
              </div>

              <div className="flex items-center gap-3.5">
                <Avatar name={user.name} size="lg" />
                <div>
                  <p className="text-sm font-bold text-foreground">{user.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {user.role && (
                      <span className="rounded-md bg-emerald-100/70 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                        {user.role}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Sedang Bertugas
                    </span>
                  </div>
                  {mySchedule.startTime && (
                    <p className="flex items-center gap-1 mt-1 text-[12px] font-semibold text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {mySchedule.startTime.slice(0, 5)}
                      {mySchedule.endTime ? ` – ${mySchedule.endTime.slice(0, 5)}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/15 dark:to-card px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                  <Bed className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{user.name}</p>
                  <span className="text-[11px] font-semibold text-slate-500">Hari Ini Libur</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {empty ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
            <CalendarDays className="h-6 w-6 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Tidak ada jadwal hari ini
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* ── Daily Summary ── */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Total", value: totalStaff, icon: <Users className="h-3.5 w-3.5" />, color: "text-foreground bg-card border-border/50" },
              { label: "Bertugas", value: workingToday, icon: <UserCheck className="h-3.5 w-3.5" />, color: "text-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30" },
              { label: "Cadangan", value: totalStaff - workingToday - offDuty, icon: <Zap className="h-3.5 w-3.5" />, color: "text-amber-600 bg-amber-50/80 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/30" },
              { label: "Libur", value: offDuty, icon: <Bed className="h-3.5 w-3.5" />, color: "text-slate-500 bg-slate-50/60 dark:bg-slate-900/20 border-slate-200/40 dark:border-slate-700/30" },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]",
                  item.color
                )}
              >
                <div className="flex items-center gap-1">
                  {item.icon}
                  <span className="text-[18px] font-black leading-none">{item.value}</span>
                </div>
                <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Bekerja Bersama Anda ── */}
          {coworkers.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/40">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-bold text-foreground">Bekerja Bersama Anda</span>
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[9px] font-bold text-primary">
                  {coworkers.length}
                </span>
              </div>
              <div>
                {coworkers.map((s) => (
                  <EmployeeRow key={s._id} schedule={s} />
                ))}
              </div>
            </div>
          )}

          {/* ── All Shifts ── */}
          <div className="space-y-2">
            {shifts.map(({ shift, staff }) => (
              <ShiftSection
                key={shift}
                shiftLabel={shift}
                staff={staff.map((s) => ({ ...s, currentUserId: user?.id }))}
                isExpanded={expandedShifts.has(shift)}
                onToggle={() => toggleShift(shift)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
                const ring = isSelected
                  ? "0 0 0 2px #3b82f6"
                  : d.isToday
                    ? "0 0 0 1px rgba(59,130,246,0.3)"
                    : "none";
                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setSelectedDay(d.day)}
                    style={{ ...CELL_STYLE, boxShadow: ring, opacity: d.hasSchedule ? 1 : 0.4 }}
                    className={cn(colors?.bg, "hover:bg-muted/50")}
                  >
                    <span
                      className="text-[11px] font-bold leading-none"
                      style={{ color: d.isToday ? "#3b82f6" : undefined }}
                    >
                      {d.day}
                    </span>
                    {d.hasSchedule && colors && (
                      <div
                        className={cn(
                          "mt-0.5 h-1 w-1 rounded-full",
                          colors.dot
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDayData && (
            <div
              className={cn(
                "rounded-xl border px-3 py-2 flex items-center gap-3",
                selectedDayData.schedule
                  ? SHIFT_THEME[selectedDayData.shiftLabel]?.bg ?? "bg-card"
                  : "bg-card"
              )}
            >
              <div className="flex flex-col items-center min-w-[32px]">
                <span className="text-lg font-black text-foreground leading-none">
                  {selectedDayData.day}
                </span>
                <span className="text-[8px] font-bold uppercase text-muted-foreground">
                  {DAY_NAMES[new Date(year, month - 1, selectedDayData.day).getDay()]}
                </span>
              </div>
              <div className="h-6 w-px bg-border/60" />
              {selectedDayData.schedule ? (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={SHIFT_THEME[selectedDayData.shiftLabel]?.dot ?? "bg-muted"}
                      style={{ width: "8px", height: "8px", borderRadius: "50%" }}
                    />
                    <span
                      className={cn(
                        "text-xs font-bold",
                        SHIFT_THEME[selectedDayData.shiftLabel]?.text ?? "text-foreground"
                      )}
                    >
                      Shift {selectedDayData.shiftLabel}
                    </span>
                  </div>
                  {selectedDayData.schedule.startTime && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {selectedDayData.schedule.startTime}
                      {selectedDayData.schedule.endTime ? ` – ${selectedDayData.schedule.endTime}` : ""}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground font-medium">Tidak ada jadwal</p>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-2">
            {Object.entries(SHIFT_THEME).map(([label, c]) => (
              <div key={label} className="flex items-center gap-1">
                <div className={c.dot} style={{ width: "6px", height: "6px", borderRadius: "50%" }} />
                <span className="text-[8px] font-bold text-muted-foreground/60 uppercase">{label}</span>
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
