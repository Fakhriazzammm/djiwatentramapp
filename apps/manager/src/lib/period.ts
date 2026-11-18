export type PeriodKey =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "3m"
  | "6m"
  | "this_year"
  | "custom";

export const PERIODS: [PeriodKey, string][] = [
  ["all", "Semua"],
  ["today", "Hari ini"],
  ["yesterday", "Kemarin"],
  ["this_week", "Minggu ini"],
  ["last_week", "Minggu lalu"],
  ["this_month", "Bulan ini"],
  ["last_month", "Bulan lalu"],
  ["3m", "3 bulan ini"],
  ["6m", "6 bulan ini"],
  ["this_year", "Tahun ini"],
  ["custom", "Rentang tanggal"],
];

const WIB_MS = 7 * 3600_000;

export const wibKey = (value: number | string | Date) => {
  const d = new Date(new Date(value).getTime() + WIB_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
export const periodDateLabel = (key: string) => new Date(`${key}T00:00:00+07:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
export const wibStart = (key: string) => new Date(`${key}T00:00:00+07:00`).getTime();
export const wibEnd = (key: string) => new Date(`${key}T23:59:59.999+07:00`).getTime();
const addDays = (key: string, days: number) => wibKey(wibStart(key) + days * 86_400_000);
const addMonths = (key: string, months: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + months, 1));
  return wibKey(d);
};
const shiftMonths = (key: string, months: number) => {
  const [year, month, day] = key.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return wibKey(target);
};

export function periodRange(period: PeriodKey, from: string, to: string): { start: number; end: number } | null {
  if (period === "all") return null;
  const now = Date.now();
  const today = wibKey(now);
  if (period === "custom") {
    if (!from || !to) return null;
    const a = from <= to ? from : to;
    const b = from <= to ? to : from;
    return { start: wibStart(a), end: wibEnd(b) };
  }
  if (period === "today") return { start: wibStart(today), end: now };
  if (period === "yesterday") {
    const y = addDays(today, -1);
    return { start: wibStart(y), end: wibEnd(y) };
  }
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = (dow + 6) % 7;
  if (period === "this_week") return { start: wibStart(addDays(today, -mondayOffset)), end: now };
  if (period === "last_week") {
    const thisMonday = addDays(today, -mondayOffset);
    return { start: wibStart(addDays(thisMonday, -7)), end: wibEnd(addDays(thisMonday, -1)) };
  }
  if (period === "this_month") return { start: wibStart(`${today.slice(0, 7)}-01`), end: now };
  if (period === "last_month") {
    return { start: wibStart(addMonths(today, -1)), end: wibEnd(addDays(addMonths(today, 0), -1)) };
  }
  if (period === "3m") return { start: wibStart(shiftMonths(today, -3)), end: now };
  if (period === "6m") return { start: wibStart(shiftMonths(today, -6)), end: now };
  return { start: wibStart(`${today.slice(0, 4)}-01-01`), end: now };
}
