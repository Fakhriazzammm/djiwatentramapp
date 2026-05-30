import { useState, useMemo, useRef, useEffect } from "react";
import { getDaysInMonth, getDay, format } from "date-fns";
import { id } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHybridAttendanceSchedules } from "@/hooks/use-hybrid-attendance-schedules";
import type { AttendanceSchedule } from "@/hooks/use-hybrid-attendance-schedules";
import { Button } from "@/components/ui/button";

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
    const sorted = SHIFT_ORDER.filter((k) => map[k]).map((k) => ({ shift: k, staff: map[k] }));
    const others = Object.keys(map)
      .filter((k) => !SHIFT_ORDER.includes(k))
      .map((k) => ({ shift: k, staff: map[k] }));
    return [...sorted, ...others];
  }, [schedules]);

  const isToday = formatDateStr(selectedDate) === formatDateStr(new Date());

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onPrevDay}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black tracking-tight">
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

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <Users className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-xs font-medium text-muted-foreground">
            Tidak ada jadwal staff di tanggal ini
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {grouped.map(({ shift, staff }) => (
            <div key={shift} className="px-2.5 py-2">
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
                    className="flex items-center gap-1 rounded-lg border border-border/60 bg-background px-1.5 py-1 text-[10px]"
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

function WeekDayCard({
  day,
  dayName,
  isToday,
  hasSchedule,
  bestSchedule,
}: {
  day: number;
  dayName: string;
  isToday: boolean;
  hasSchedule: boolean;
  bestSchedule: AttendanceSchedule | null;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-xl border py-2 px-1 transition-all",
        isToday && "border-primary/50 ring-1 ring-primary/20 bg-primary/[0.03]",
        !isToday && "border-border/40",
        hasSchedule ? "bg-card" : "bg-muted/20 opacity-55"
      )}
    >
      <span className={cn(
        "text-[8px] font-bold uppercase tracking-wider leading-none",
        isToday ? "text-primary" : "text-muted-foreground/60"
      )}>
        {dayName}
      </span>
      <span className={cn(
        "text-sm font-black leading-tight",
        isToday ? "text-primary" : "text-foreground"
      )}>
        {day}
      </span>
      {bestSchedule ? (
        <span className={cn(
          "mt-0.5 rounded-full px-1.5 py-[2px] text-[7px] font-bold tracking-wide leading-none",
          getShiftLabelClass(bestSchedule)
        )}>
          {getShiftLabel(bestSchedule)}
        </span>
      ) : (
        <span className="mt-0.5 text-[8px] text-muted-foreground/25 font-medium">—</span>
      )}
    </div>
  );
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
  const [mode, setMode] = useState<"personal" | "team">("personal");
  const [teamDate, setTeamDate] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  const teamMonth = teamDate.getMonth() + 1;
  const teamYear = teamDate.getFullYear();

  const effectiveMonth = mode === "personal" ? month : teamMonth;
  const effectiveYear = mode === "personal" ? year : teamYear;
  const { data: schedulesByDate, isLoading } = useHybridAttendanceSchedules(effectiveMonth, effectiveYear);

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

  const weeks = useMemo(() => {
    if (mode !== "personal") return [];
    const result: { days: typeof days; weekIndex: number; dateLabel: string }[] = [];
    let current: (typeof days[0])[] = [];
    let weekStartDay = 0;

    for (const d of days) {
      if (current.length === 0) weekStartDay = d.day;
      current.push(d);
      if (d.dayName === "Sab" || d.day === days[days.length - 1].day) {
        const weekEndDay = d.day;
        const startDate = new Date(year, month - 1, weekStartDay);
        const endDate = new Date(year, month - 1, weekEndDay);
        const dateLabel = `${startDate.getDate()} ${MONTHS_SHORT[startDate.getMonth()]}`;
        result.push({
          days: current,
          weekIndex: result.length,
          dateLabel,
        });
        current = [];
      }
    }
    if (current.length > 0) {
      result.push({
        days: current,
        weekIndex: result.length,
        dateLabel: `${current[0].day} ${MONTHS_SHORT[month - 1]}`,
      });
    }
    return result;
  }, [days, year, month, mode]);

  useEffect(() => {
    if (!scrollRef.current || weeks.length === 0) return;
    const weekIdx = weeks.findIndex((w) => w.days.some((d) => d.isToday));
    if (weekIdx > 0) {
      const child = scrollRef.current.children[weekIdx] as HTMLElement;
      if (child) {
        child.scrollIntoView({ behavior: "auto", inline: "start", block: "nearest" });
      }
    }
  }, [weeks]);

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
      <div className="rounded-2xl border bg-card p-3">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const hasAnySchedule = days.some((d) => d.hasSchedule);

  return (
    <div className="space-y-3">
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
          <div className="relative">
            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide pb-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {weeks.map((week) => (
                <div
                  key={week.weekIndex}
                  className="snap-start shrink-0 min-w-full flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
                      {week.dateLabel}
                    </span>
                    {week.days.some((d) => d.isToday) && (
                      <span className="rounded-full bg-primary/10 px-2 py-[1px] text-[7px] font-bold text-primary uppercase tracking-wider">
                        Minggu ini
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {week.days.map((d) => (
                      <WeekDayCard
                        key={d.dateStr}
                        day={d.day}
                        dayName={d.dayName}
                        isToday={d.isToday}
                        hasSchedule={d.hasSchedule}
                        bestSchedule={d.bestSchedule}
                      />
                    ))}
                    {week.days.length < 7 &&
                      Array.from({ length: 7 - week.days.length }).map((_, i) => (
                        <div key={`fill-${i}`} />
                      ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-1 mt-1">
              {weeks.map((week) => (
                <div
                  key={week.weekIndex}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    week.days.some((d) => d.isToday)
                      ? "w-4 bg-primary"
                      : "w-1 bg-muted-foreground/20"
                  )}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground/50">
                Shift:
              </span>
              {Object.entries(shiftLabelColors).map(([label, cls]) => (
                <span
                  key={label}
                  className={cn("rounded-full px-1.5 py-[1px] text-[7px] font-bold leading-none", cls)}
                >
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

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];
