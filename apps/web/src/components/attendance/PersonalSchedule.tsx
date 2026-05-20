import { useMemo } from "react";
import { getDaysInMonth, getDay } from "date-fns";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHybridAttendanceSchedules } from "@/hooks/use-hybrid-attendance-schedules";
import type { AttendanceSchedule } from "@/hooks/use-hybrid-attendance-schedules";

const FULL_DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

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

export function PersonalSchedule({
  userId,
  month,
  year,
}: {
  userId: string;
  month: number;
  year: number;
}) {
  const { data: schedulesByDate, isLoading } = useHybridAttendanceSchedules(month, year);

  const days = useMemo(() => {
    const totalDays = getDaysInMonth(new Date(year, month - 1));

    return Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  }, [schedulesByDate, userId, month, year]);

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
      <div className="flex items-center gap-2 px-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h3 className="font-bold uppercase tracking-wider text-sm">Jadwal Pribadi</h3>
        {!hasAnySchedule && (
          <span className="text-[10px] text-muted-foreground font-medium">
            — Belum ada jadwal di bulan ini
          </span>
        )}
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
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
            <span
              key={label}
              className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-bold", cls)}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
