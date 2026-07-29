import type { ShiftSchedule } from "./attendance-schedule-import";

// ─── Template model ────────────────────────────────────────────

export type RosterTemplateGroup = {
  label: string;
  roleLabel?: string;
  colorKey?: string;
  staff: Array<{
    rawName: string;
    userId?: string;
    displayName?: string;
    roleLabel?: string;
  }>;
};

export type RosterTemplate = {
  groups: RosterTemplateGroup[];
  colors?: {
    title?: string;
    groups?: Record<string, string>;
    shifts?: Record<string, string>;
  };
  updatedAt?: string;
};

export type ImportTemplateConfig = {
  staffAliases?: Record<string, string>; // rawName -> app userName
  rosterTemplate?: RosterTemplate;
  unresolvedStaff?: Array<{
    rawName: string;
    placeholderLabel: string;
    mappedUserId?: string;
    status: "unresolved" | "mapped" | "placeholder";
  }>;
};

// ─── Shift settings resolver ───────────────────────────────────

export function buildShiftResolver(
  shiftSchedules?: ShiftSchedule[]
): {
  getShiftTimes: (shiftName: string) => { openTime?: string; closeTime?: string };
  formatDisplayTime: (time?: string) => string; // HH:mm → HH.mm
  getSortedShifts: () => ShiftSchedule[];
} {
  const schedules = shiftSchedules ?? [];

  const getShiftTimes = (shiftName: string) => {
    const found = schedules.find(
      (s) =>
        s.name.toLowerCase() === shiftName.toLowerCase() ||
        s.name.toLowerCase().includes(shiftName.toLowerCase()) ||
        shiftName.toLowerCase().includes(s.name.toLowerCase())
    );
    return {
      openTime: found?.openTime,
      closeTime: found?.closeTime,
    };
  };

  const formatDisplayTime = (time?: string): string => {
    if (!time) return "";
    // Convert HH:mm to HH.mm
    return time.replace(":", ".");
  };

  const getSortedShifts = () => [...schedules];

  return { getShiftTimes, formatDisplayTime, getSortedShifts };
}

// ─── Utility: get week label ───────────────────────────────────

export function getWeekLabelN(date: Date, month: number): number {
  const firstDay = new Date(date.getFullYear(), month - 1, 1);
  const diff = date.getDate() - firstDay.getDate();
  return Math.floor((firstDay.getDay() + diff) / 7) + 1;
}

export function formatWeekLabel(n: number): string {
  return `Minggu Ke ${n}`;
}

// ─── Utility: generate full date rows for a month ─────────────

export function generateMonthDateRows(
  month: number,
  year: number
): Array<{ dateStr: string; dayName: string; weekLabel: string }> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows: Array<{ dateStr: string; dayName: string; weekLabel: string }> = [];
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const date = new Date(dateStr + "T00:00:00");
    const dayName = dayNames[date.getDay()];
    const weekN = getWeekLabelN(date, month);
    rows.push({ dateStr, dayName, weekLabel: formatWeekLabel(weekN) });
  }

  return rows;
}
