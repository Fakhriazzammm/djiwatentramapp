import { useState, useMemo } from "react";
import { getDaysInMonth, getDay, format } from "date-fns";
import { id } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cn } from "../../lib/utils";
import { useHybridAttendanceSchedules } from "../../hooks/use-hybrid-attendance-schedules";
import type { AttendanceSchedule } from "../../hooks/use-hybrid-attendance-schedules";
import { Button } from "../ui/button";

const FULL_DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const SHIFT_ORDER = ["PAGI", "SORE", "GENERAL", "OFF"];

const shiftLabelColors: Record<string, string> = {
  PAGI: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200",
  SORE: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200",
  OFF: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200",
  GENERAL: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200",
};

function getShiftLabel(schedule?: AttendanceSchedule): string {
  if (!schedule) return "-";
  const shift = schedule.shiftName.toLowerCase();
  if (schedule.status === "off" || shift === "off") return "OFF";
  if (shift.includes("pagi")) return "PAGI";
  if (shift.includes("sore")) return "SORE";
  if (shift.includes("general")) return "GENERAL";
  return schedule.shiftName.toUpperCase();
}

function getShiftLabelClass(schedule?: AttendanceSchedule): string {
  const label = getShiftLabel(schedule);
  return shiftLabelColors[label] ?? "bg-muted text-muted-foreground border-border";
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── TeamDayView ──────────────────────────────────────────────

function TeamDayView({
  schedules,
  selectedDate,
  onPrevDay,
  onNextDay,
}: {
  schedules: AttendanceSchedule[];
  selectedDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
}) {
  const grouped = useMemo(() => {
    const map: Record<string, AttendanceSchedule[]> = {};
    for (const s of schedules) {
      const label = getShiftLabel(s);
      if (!map[label]) map[label] = [];
      map[label].push(s);
    }
    // Sort by SHIFT_ORDER, any unknown labels go last
    const sorted = SHIFT_ORDER.filter((k) => map[k]).map((k) => ({ shift: k, staff: map[k] }));
    const others = Object.keys(map)
      .filter((k) => !SHIFT_ORDER.includes(k))
      .map((k) => ({ shift: k, staff: map[k] }));
    return [...sorted, ...others];
  }, [schedules]);

  const isToday =
    formatDateStr(selectedDate) === formatDateStr(new Date());

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      {/* Date navigator */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onPrevDay}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black tracking-tight">
            {format(selectedDate, "d MMMM yyyy", { locale: id })}
          </span>
          {isToday && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary uppercase">
              Hari Ini
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onNextDay}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Staff list */}
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Users className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-xs font-medium text-muted-foreground">
            Tidak ada jadwal staff di tanggal ini
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {grouped.map(({ shift, staff }) => (
            <div key={shift} className="px-3 py-2.5">
              <div className="mb-2 flex items-center gap-2">
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-bold",
                  shiftLabelColors[shift] ?? "bg-muted text-muted-foreground border-border"
                )}>
                  {shift}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {staff.length} {staff.length === 1 ? "orang" : "orang"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {staff.map((s) => (
                  <div
                    key={s._id}
                    className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs"
                  >
                    <span className="font-bold text-foreground">{s.userName}</span>
                    <span className="text-[10px] text-muted-foreground">— {s.roleName}</span>
                    {s.startTime && (
                      <span className="text-[9px] text-muted-foreground/60 ml-0.5">
                        {s.startTime}{s.endTime ? `-${s.endTime}` : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PersonalSchedule ─────────────────────────────────────────

export function PersonalSchedule({
  userId,
  month,
  year,
}: {
  userId: string;
  month: number;
  year: number;
}) {
  const [mode, setMode] = useState<"personal" | "team">("personal");
  const [teamDate, setTeamDate] = useState(() => new Date());

  const teamMonth = teamDate.getMonth() + 1;
  const teamYear = teamDate.getFullYear();

  // Fetch schedules for the effective month based on mode
  const effectiveMonth = mode === "personal" ? month : teamMonth;
  const effectiveYear = mode === "personal" ? year : teamYear;
  const { data: schedulesByDate, isLoading } = useHybridAttendanceSchedules(effectiveMonth, effectiveYear);

  // Personal mode: build days
  const days = useMemo(() => {
    if (mode !== "personal") return [];
    const totalDays = getDaysInMonth(new Date(year, month - 1));
    return Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1;
      const dateStr = formatDateStr(new Date(year, month - 1, day));
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const daySchedules: AttendanceSchedule[] =
        (schedulesByDate?.[dateStr] ?? []).filter((s: AttendanceSchedule) => s.userId === userId);
      const today = new Date();
      const isCurrent =
        today.getFullYear() === year &&
        today.getMonth() + 1 === month &&
        today.getDate() === day;

      return {
        day,
        dateStr,
        dayName: FULL_DAY_NAMES[dayOfWeek],
        isToday: isCurrent,
        hasSchedule: daySchedules.length > 0,
        bestSchedule: daySchedules[0] ?? null,
      };
    });
  }, [schedulesByDate, userId, month, year, mode]);

  // Team mode: get schedules for selected date
  const teamSchedules = useMemo(() => {
    if (mode !== "team") return [];
    const dateStr = formatDateStr(teamDate);
    return schedulesByDate?.[dateStr] ?? [];
  }, [schedulesByDate, teamDate, mode]);

  const handlePrevDay = () => {
    setTeamDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1));
  };
  const handleNextDay = () => {
    setTeamDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex animate-pulse gap-1.5 overflow-hidden">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-16 w-14 shrink-0 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const hasAnySchedule = days.some((d) => d.hasSchedule);

  return (
    <div className="space-y-3">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="font-bold uppercase tracking-wider text-sm">Jadwal</h3>
        </div>
        <div className="flex items-center rounded-lg border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setMode("personal")}
            className={cn(
              "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all",
              mode === "personal"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Pribadi
          </button>
          <button
            type="button"
            onClick={() => setMode("team")}
            className={cn(
              "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all",
              mode === "team"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tim
          </button>
        </div>
      </div>

      {mode === "personal" ? (
        <>
          {!hasAnySchedule && (
            <p className="text-[10px] text-muted-foreground font-medium px-2">
              Belum ada jadwal di bulan ini
            </p>
          )}
          <div className="rounded-2xl border bg-card">
            <div className="flex gap-1.5 overflow-x-auto p-3 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
              {days.map((d) => (
                <div
                  key={d.dateStr}
                  className={cn(
                    "flex w-[62px] shrink-0 flex-col items-center gap-1 rounded-xl border p-2 transition-all",
                    d.isToday && "border-primary/40 ring-1 ring-primary/20 bg-primary/[0.02]",
                    !d.isToday && "border-border/60",
                    d.hasSchedule ? "bg-card" : "bg-muted/30 opacity-70"
                  )}
                >
                  <span className={cn(
                    "text-[9px] font-bold uppercase tracking-wider",
                    d.isToday ? "text-primary" : "text-muted-foreground"
                  )}>
                    {d.dayName}
                  </span>
                  <span className={cn(
                    "text-xs font-black leading-none",
                    d.isToday && "text-primary"
                  )}>
                    {d.day}
                  </span>
                  {d.bestSchedule ? (
                    <span className={cn(
                      "mt-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold tracking-wide",
                      getShiftLabelClass(d.bestSchedule)
                    )}>
                      {getShiftLabel(d.bestSchedule)}
                    </span>
                  ) : (
                    <span className="mt-1 text-[9px] text-muted-foreground/40 font-medium">—</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 px-3 py-2">
              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">Legenda:</span>
              {Object.entries(shiftLabelColors).map(([label, cls]) => (
                <span key={label} className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-bold", cls)}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <TeamDayView
          schedules={teamSchedules}
          selectedDate={teamDate}
          onPrevDay={handlePrevDay}
          onNextDay={handleNextDay}
        />
      )}
    </div>
  );
}
