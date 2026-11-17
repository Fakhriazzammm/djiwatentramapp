export type ManagerPeriodKey =
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

const PERIOD_KEYS = new Set<string>([
  "all", "today", "yesterday", "this_week", "last_week",
  "this_month", "last_month", "3m", "6m", "this_year", "custom",
]);
const WIB_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

const pad = (value: number) => String(value).padStart(2, "0");
export const wibKey = (value: number | Date) => {
  const d = new Date(new Date(value).getTime() + WIB_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const dayStart = (key: string) => Date.parse(`${key}T00:00:00+07:00`);
const dayEnd = (key: string) => Date.parse(`${key}T23:59:59.999+07:00`);
const addDays = (key: string, days: number) => wibKey(dayStart(key) + days * DAY_MS);
const addMonths = (key: string, months: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + months, 1));
  return wibKey(d.getTime());
};
const shiftMonths = (key: string, months: number) => {
  const [year, month, day] = key.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return wibKey(target.getTime());
};
const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export type ManagerPeriodRange = {
  period: ManagerPeriodKey;
  start: number;
  end: number;
  hourly: boolean;
  bucket: "hour" | "day" | "month";
};

export function resolveManagerPeriod(
  periodInput: string,
  fromInput: string,
  toInput: string,
  now = Date.now(),
  allStart?: number,
): ManagerPeriodRange {
  const period = (PERIOD_KEYS.has(periodInput) ? periodInput : "all") as ManagerPeriodKey;
  const today = wibKey(now);
  let start = dayStart(today);
  let end = now;

  if (period === "all") {
    start = allStart && allStart > 0 ? allStart : dayStart("2020-01-01");
  } else if (period === "today") {
    start = dayStart(today);
  } else if (period === "yesterday") {
    const y = addDays(today, -1);
    start = dayStart(y);
    end = dayEnd(y);
  } else if (period === "this_week" || period === "last_week") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const thisMonday = addDays(today, -((dow + 6) % 7));
    if (period === "this_week") {
      start = dayStart(thisMonday);
    } else {
      start = dayStart(addDays(thisMonday, -7));
      end = dayEnd(addDays(thisMonday, -1));
    }
  } else if (period === "this_month") {
    start = dayStart(`${today.slice(0, 7)}-01`);
  } else if (period === "last_month") {
    start = dayStart(addMonths(today, -1));
    end = dayEnd(addDays(addMonths(today, 0), -1));
  } else if (period === "3m" || period === "6m") {
    start = dayStart(shiftMonths(today, period === "3m" ? -3 : -6));
  } else if (period === "this_year") {
    start = dayStart(`${today.slice(0, 4)}-01-01`);
  } else if (period === "custom") {
    const from = isDateKey(fromInput) ? fromInput : "";
    const to = isDateKey(toInput) ? toInput : "";
    if (from && to) {
      const a = from <= to ? from : to;
      const b = from <= to ? to : from;
      start = dayStart(a);
      end = dayEnd(b);
    } else {
      start = dayStart(`${today.slice(0, 7)}-01`);
    }
  }

  const hourly = period === "today" || period === "yesterday";
  const bucket: ManagerPeriodRange["bucket"] = hourly
    ? "hour"
    : period === "3m" || end - start <= 92 * DAY_MS
      ? "day"
      : "month";
  return { period, start, end, hourly, bucket };
}

export function periodSeries(start: number, end: number, bucket: ManagerPeriodRange["bucket"]) {
  if (bucket === "hour") {
    const base = dayStart(wibKey(start));
    return Array.from({ length: 24 }, (_, hour) => ({
      key: `${pad(hour)}:00`,
      start_ms: base + hour * 3_600_000,
      end_ms: base + (hour + 1) * 3_600_000,
    }));
  }
  const series: { key: string; start_ms: number; end_ms: number }[] = [];
  if (bucket === "month") {
    let key = monthStart(wibKey(start));
    const last = monthStart(wibKey(end));
    while (key.slice(0, 7) <= last.slice(0, 7) && series.length < 240) {
      const next = addMonths(key, 1);
      series.push({ key: key.slice(0, 7), start_ms: dayStart(key), end_ms: dayStart(next) - 1 });
      key = next;
    }
    return series;
  }
  let key = wibKey(start);
  const last = wibKey(end);
  while (key <= last && series.length < 400) {
    series.push({ key, start_ms: dayStart(key), end_ms: dayEnd(key) });
    key = addDays(key, 1);
  }
  return series;
}
