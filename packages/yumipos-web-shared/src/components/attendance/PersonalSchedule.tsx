import { useState, useMemo, useEffect, useCallback } from "react";
import { getDaysInMonth, format } from "date-fns";
import { id } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cn } from "../../lib/utils";
import { useHybridAttendanceSchedules } from "../../hooks/use-hybrid-attendance-schedules";
import type { AttendanceSchedule } from "../../hooks/use-hybrid-attendance-schedules";
import { Button } from "../ui/button";

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const SHIFT_ORDER = ["PAGI", "SORE", "GENERAL", "OFF"];

const shiftColors: Record<string, { bg: string; text: string; dot: string }> = {
  PAGI: { bg: "bg-emerald-100 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  SORE: { bg: "bg-sky-100 dark:bg-sky-950/50", text: "text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  OFF: { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-600 dark:text-rose-300", dot: "bg-rose-400" },
  GENERAL: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
};

function getShiftLabel(schedule?: AttendanceSchedule): string {
  if (!schedule) return "";
  const shift = schedule.shiftName.toLowerCase();
  if (schedule.status === "off" || shift === "off") return "OFF";
  if (shift.includes("pagi")) return "PAGI";
  if (shift.includes("sore")) return "SORE";
  if (shift.includes("general")) return "GENERAL";
  return schedule.shiftName.toUpperCase();
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
    const sorted = SHIFT_ORDER.filter((k) => map[k]).map((k) => ({ shift: k, staff: map[k]! }));
    const others = Object.keys(map)
      .filter((k) => !SHIFT_ORDER.includes(k))
      .map((k) => ({ shift: k, staff: map[k]! }));
    return [...sorted, ...others];
  }, [schedules]);

  const isToday = formatDateStr(selectedDate) === formatDateStr(new Date());

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onPrevDay}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black tracking-tight">
            {format(selectedDate, "EEEE, d MMM yyyy", { locale: id })}
          </span>
          {isToday && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-bold text-primary uppercase">
              Hari Ini
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onNextDay}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Users className="h-5 w-5 text-muted-foreground/30" />
          <p className="text-[11px] font-medium text-muted-foreground">
            Tidak ada jadwal di tanggal ini
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {grouped.map(({ shift, staff }) => {
            const colors = shiftColors[shift] ?? { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" };
            return (
              <div key={shift} className={cn("rounded-xl px-3 py-2", colors.bg)}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider", colors.text)}>
                    {shift}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {staff.length} orang
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {staff.map((s) => (
                    <span
                      key={s._id}
                      className="rounded-md bg-white/70 dark:bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                    >
                      {s.userName}
                      {s.startTime && (
                        <span className="text-muted-foreground/60 ml-1 text-[9px]">
                          {s.startTime}{s.endTime ? `–${s.endTime}` : ""}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
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
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const teamMonth = teamDate.getMonth() + 1;
  const teamYear = teamDate.getFullYear();

  const effectiveMonth = mode === "personal" ? month : teamMonth;
  const effectiveYear = mode === "personal" ? year : teamYear;
  const { data: schedulesByDate, isLoading } = useHybridAttendanceSchedules(effectiveMonth, effectiveYear);

  // Build calendar days
  const { days, firstDayOffset } = useMemo(() => {
    if (mode !== "personal") return { days: [] as any[], firstDayOffset: 0 };
    const totalDays = getDaysInMonth(new Date(year, month - 1));
    const offset = new Date(year, month - 1, 1).getDay(); // 0=Sun
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

  // Auto-select today
  useEffect(() => {
    if (mode !== "personal") return;
    const todayDay = days.find((d: any) => d.isToday);
    if (todayDay) setSelectedDay(todayDay.day);
  }, [days, mode]);

  const selectedDayData = useMemo(() => {
    if (!selectedDay) return null;
    return days.find((d: any) => d.day === selectedDay) ?? null;
  }, [days, selectedDay]);

  // Team mode
  const teamSchedules = useMemo(() => {
    if (mode !== "team") return [];
    const dateStr = formatDateStr(teamDate);
    return schedulesByDate?.[dateStr] ?? [];
  }, [schedulesByDate, teamDate, mode]);

  const handlePrevDay = useCallback(() => {
    setTeamDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1));
  }, []);
  const handleNextDay = useCallback(() => {
    setTeamDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          <h3 className="font-bold uppercase tracking-wider text-[11px]">Jadwal</h3>
        </div>
        <div className="flex items-center rounded-lg border bg-muted/50 p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setMode("personal")}
            className={cn(
              "rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all",
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
              "rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all",
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
        <div className="space-y-2">
          {/* Mini calendar grid */}
          <div className="rounded-xl border bg-card p-2">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "text-center text-[8px] font-bold uppercase tracking-widest py-0.5",
                    i === 0 ? "text-rose-400" : "text-muted-foreground/50"
                  )}
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Date cells */}
            <div className="grid grid-cols-7 gap-[3px]">
              {/* Leading empty cells */}
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <div key={`e-${i}`} className="h-9" />
              ))}
              {days.map((d: any) => {
                const colors = d.shiftLabel ? shiftColors[d.shiftLabel] : null;
                const isSelected = selectedDay === d.day;
                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setSelectedDay(d.day)}
                    className={cn(
                      "relative flex flex-col items-center justify-center rounded-lg h-9 transition-all text-center",
                      isSelected && "ring-2 ring-primary ring-offset-1",
                      d.isToday && !isSelected && "ring-1 ring-primary/30",
                      colors ? colors.bg : "hover:bg-muted/50",
                      !d.hasSchedule && "opacity-40"
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px] font-bold leading-none",
                        d.isToday ? "text-primary" : "text-foreground"
                      )}
                    >
                      {d.day}
                    </span>
                    {colors && (
                      <div className={cn("h-1 w-1 rounded-full mt-0.5", colors.dot)} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day detail */}
          {selectedDayData && (
            <div className={cn(
              "rounded-xl border px-3 py-2 flex items-center gap-3",
              selectedDayData.schedule
                ? (shiftColors[selectedDayData.shiftLabel]?.bg ?? "bg-card")
                : "bg-card"
            )}>
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
                    <div className={cn("h-2 w-2 rounded-full", shiftColors[selectedDayData.shiftLabel]?.dot ?? "bg-muted")} />
                    <span className={cn(
                      "text-xs font-bold",
                      shiftColors[selectedDayData.shiftLabel]?.text ?? "text-foreground"
                    )}>
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
          <div className="flex items-center gap-2 px-1">
            {Object.entries(shiftColors).map(([label, c]) => (
              <div key={label} className="flex items-center gap-1">
                <div className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                <span className="text-[8px] font-bold text-muted-foreground/60 uppercase">{label}</span>
              </div>
            ))}
          </div>
        </div>
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
