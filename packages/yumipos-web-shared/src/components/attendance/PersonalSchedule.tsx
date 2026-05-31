import { useState, useMemo, useEffect, useCallback } from "react";
import { getDaysInMonth, format, startOfWeek, addDays, isSameDay } from "date-fns";
import { id } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Users, User } from "lucide-react";
import { cn } from "../../lib/utils";
import { useHybridAttendanceSchedules } from "../../hooks/use-hybrid-attendance-schedules";
import type { AttendanceSchedule } from "../../hooks/use-hybrid-attendance-schedules";
import { Button } from "../ui/button";

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DAY_NAMES_SHORT = ["M", "S", "S", "R", "K", "J", "S"];
const SHIFT_ORDER = ["PAGI", "SORE", "GENERAL", "OFF"];

const shiftColors: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  PAGI: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  SORE: {
    bg: "bg-sky-50 dark:bg-sky-950/30",
    text: "text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    border: "border-sky-200 dark:border-sky-800",
  },
  OFF: {
    bg: "bg-rose-50/50 dark:bg-rose-950/20",
    text: "text-rose-600 dark:text-rose-300",
    dot: "bg-rose-400",
    border: "border-rose-200 dark:border-rose-800",
  },
  GENERAL: {
    bg: "bg-slate-50 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400",
    border: "border-slate-200 dark:border-slate-700",
  },
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

// Inline styles for guaranteed 7-column grid (bypasses Tailwind class scanning)
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
  background: "transparent",
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

const WEEKDAY_HEADER_STYLE: React.CSSProperties = {
  textAlign: "center",
  fontSize: "7px",
  fontWeight: 700,
  textTransform: "uppercase",
  color: "#9ca3af",
  paddingBottom: "4px",
};

// ─── TeamWeekView ─────────────────────────────────────────────

interface DayWithSchedules {
  date: Date;
  dateStr: string;
  isToday: boolean;
  schedules: AttendanceSchedule[];
}

function TeamWeekView({
  schedulesByDate,
  selectedDate,
  onPrevWeek,
  onNextWeek,
}: {
  schedulesByDate: Record<string, AttendanceSchedule[]>;
  selectedDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const dateStr = formatDateStr(date);
      return {
        date,
        dateStr,
        isToday: isSameDay(date, new Date()),
        schedules: schedulesByDate?.[dateStr] ?? [],
      };
    });
  }, [schedulesByDate, selectedDate]);

  // Build a matrix: shift x day → staff list
  const matrix = useMemo(() => {
    const result: Record<string, { dayIdx: number; staff: AttendanceSchedule[] }[]> = {};
    for (const shift of SHIFT_ORDER) {
      result[shift] = [];
    }
    weekDays.forEach((wd, dayIdx) => {
      const byShift: Record<string, AttendanceSchedule[]> = {};
      for (const s of wd.schedules) {
        const label = getShiftLabel(s);
        if (!byShift[label]) byShift[label] = [];
        byShift[label].push(s);
      }
      for (const shift of SHIFT_ORDER) {
        result[shift].push({ dayIdx, staff: byShift[shift] ?? [] });
      }
      // Handle unknown shift types
      const unknownShifts = Object.keys(byShift).filter((k) => !SHIFT_ORDER.includes(k));
      unknownShifts.forEach((ushift) => {
        if (!result[ushift]) {
          result[ushift] = Array.from({ length: 7 }, () => ({ dayIdx: 0, staff: [] }));
        }
        result[ushift][dayIdx] = { dayIdx, staff: byShift[ushift] };
      });
    });
    return result;
  }, [weekDays]);

  const weekLabel = useMemo(() => {
    const start = weekDays[0].date;
    const end = weekDays[6].date;
    const startMonth = MONTHS_SHORT[start.getMonth()];
    const endMonth = MONTHS_SHORT[end.getMonth()];
    if (startMonth === endMonth) {
      return `${start.getDate()}–${end.getDate()} ${startMonth}`;
    }
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
  }, [weekDays]);

  // Highlight selected day column
  const selectedDayIdx = weekDays.findIndex((wd) => isSameDay(wd.date, selectedDate));

  const allStaffForWeek: AttendanceSchedule[] = weekDays.flatMap((wd) => wd.schedules);
  const hasAnySchedule = allStaffForWeek.length > 0;

  return (
    <div className="space-y-2">
      {/* Week Navigator */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onPrevWeek}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black tracking-tight">{weekLabel}</span>
          {weekDays.some((wd) => wd.isToday) && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[7px] font-bold text-primary uppercase">
              Minggu ini
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onNextWeek}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!hasAnySchedule ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Users className="h-5 w-5 text-muted-foreground/30" />
          <p className="text-[11px] font-medium text-muted-foreground">
            Tidak ada jadwal minggu ini
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {/* Day headers */}
          <div style={DAY_HEADER_STYLE}>
            {weekDays.map((wd, i) => (
              <div key={i} style={{ ...WEEKDAY_HEADER_STYLE, color: wd.isToday ? "#3b82f6" : undefined }}>
                <div style={{ marginBottom: "1px" }}>{DAY_NAMES[i === 6 ? 0 : i + 1]}</div>
                <span className={cn(
                  "text-[10px] font-black mx-auto flex items-center justify-center rounded-full",
                  wd.isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                )}
                style={{
                  width: "22px",
                  height: "22px",
                  display: "inline-flex",
                }}
              >
                {wd.date.getDate()}
              </span>
              </div>
            ))}
          </div>

          {/* Shift rows */}
          <div className="space-y-2">
            {SHIFT_ORDER.map((shift) => {
              const shiftCells = matrix[shift];
              if (!shiftCells || shiftCells.every((c) => c.staff.length === 0)) return null;
              const colors = shiftColors[shift] ?? shiftColors.GENERAL;
              return (
                <div key={shift} className={cn("rounded-xl border p-2", colors.bg, colors.border)}>
                  {/* Shift label + count */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
                    <span className={cn("text-[9px] font-bold uppercase tracking-wider", colors.text)}>
                      {shift}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {shiftCells.reduce((sum, c) => sum + c.staff.length, 0)} orang
                    </span>
                  </div>
                  {/* 7-column staff grid */}
                  <div style={GRID_7_STYLE}>
                    {shiftCells.map((cell, dayIdx) => (
                      <div
                        key={dayIdx}
                        className={cn(
                          "rounded-md px-1 py-0.5 min-h-[24px]",
                          dayIdx === selectedDayIdx && "ring-1 ring-inset ring-primary/20"
                        )}
                      >
                        {cell.staff.length === 0 ? (
                          <div className="text-[9px] text-muted-foreground/20 text-center">—</div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {cell.staff.slice(0, 3).map((s) => (
                              <div key={s._id} className="flex items-center gap-1">
                                <div
                                  className={cn(
                                    "flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-black",
                                    colors.text,
                                    "bg-white/70 dark:bg-black/20"
                                  )}
                                >
                                  {(s.userName?.[0] ?? "?").toUpperCase()}
                                </div>
                                <span className="text-[8px] font-semibold text-foreground leading-none truncate">
                                  {s.userName?.split(" ")[0]}
                                </span>
                              </div>
                            ))}
                            {cell.staff.length > 3 && (
                              <span className="text-[7px] text-muted-foreground pl-5">
                                +{cell.staff.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const teamMonth = selectedDate.getMonth() + 1;
  const teamYear = selectedDate.getFullYear();

  const effectiveMonth = mode === "personal" ? month : teamMonth;
  const effectiveYear = mode === "personal" ? year : teamYear;
  const { data: schedulesByDate, isLoading } = useHybridAttendanceSchedules(effectiveMonth, effectiveYear);

  // ── Personal mode ──────────────────────────────────────────

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

  // ── Team mode ──────────────────────────────────────────────

  const handlePrevWeek = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);
  const handleNextWeek = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);

  // ── Loading ────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────

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
                const colors = d.shiftLabel ? shiftColors[d.shiftLabel] : null;
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
                    {colors && (
                      <div
                        className={cn("mt-0.5", colors.dot)}
                        style={{ width: "4px", height: "4px", borderRadius: "50%" }}
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
                  ? shiftColors[selectedDayData.shiftLabel]?.bg ?? "bg-card"
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
                      className={shiftColors[selectedDayData.shiftLabel]?.dot ?? "bg-muted"}
                      style={{ width: "8px", height: "8px", borderRadius: "50%" }}
                    />
                    <span
                      className={cn(
                        "text-xs font-bold",
                        shiftColors[selectedDayData.shiftLabel]?.text ?? "text-foreground"
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
            {Object.entries(shiftColors).map(([label, c]) => (
              <div key={label} className="flex items-center gap-1">
                <div className={c.dot} style={{ width: "6px", height: "6px", borderRadius: "50%" }} />
                <span className="text-[8px] font-bold text-muted-foreground/60 uppercase">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <TeamWeekView
          schedulesByDate={schedulesByDate ?? {}}
          selectedDate={selectedDate}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
        />
      )}
    </div>
  );
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
