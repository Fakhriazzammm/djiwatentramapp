import { useEffect, useState } from "react";

/**
 * Waktu hari untuk beranda customer (zona waktu perangkat).
 * pagi 05.00–10.59, siang 11.00–14.59, sore 15.00–17.59, malam 18.00–04.59.
 */
export type DayPeriod = "pagi" | "siang" | "sore" | "malam";

export const DAY_PERIODS: readonly DayPeriod[] = ["pagi", "siang", "sore", "malam"];

const PERIOD_START_HOURS: ReadonlyArray<readonly [DayPeriod, number]> = [
  ["pagi", 5],
  ["siang", 11],
  ["sore", 15],
  ["malam", 18],
];

export function getDayPeriod(date: Date = new Date()): DayPeriod {
  const hour = date.getHours();
  if (hour >= 18 || hour < 5) return "malam";
  if (hour >= 15) return "sore";
  if (hour >= 11) return "siang";
  return "pagi";
}

export function isDayPeriod(value: unknown): value is DayPeriod {
  return typeof value === "string" && (DAY_PERIODS as readonly string[]).includes(value);
}

export function greetingForPeriod(period: DayPeriod): string {
  return `Selamat ${period}`;
}

/** Milidetik sampai batas waktu hari berikutnya (05, 11, 15, atau 18). Minimal 1 detik. */
export function msUntilNextPeriod(date: Date = new Date()): number {
  const next = new Date(date);
  const hours = PERIOD_START_HOURS.map(([, hour]) => hour);
  const nextHour = hours.find((hour) => hour * 3_600_000 > ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds());
  if (nextHour === undefined) {
    next.setDate(next.getDate() + 1);
    next.setHours(hours[0], 0, 0, 0);
  } else {
    next.setHours(nextHour, 0, 0, 0);
  }
  return Math.max(1000, next.getTime() - date.getTime());
}

/**
 * Pratinjau/QA: `?waktu=malam` memaksa waktu hari tanpa mengubah jam perangkat.
 * Hanya kosmetik (gambar dan sapaan), tidak memengaruhi data atau pesanan.
 */
function readOverride(): DayPeriod | null {
  if (typeof window === "undefined") return null;
  try {
    const value = new URLSearchParams(window.location.search).get("waktu");
    return isDayPeriod(value) ? value : null;
  } catch {
    return null;
  }
}

/** Waktu hari yang berganti otomatis di batas jam dan saat tab aktif kembali. */
export function useDayPeriod(): DayPeriod {
  const [period, setPeriod] = useState<DayPeriod>(() => readOverride() ?? getDayPeriod());

  useEffect(() => {
    if (readOverride()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => setPeriod(getDayPeriod());
    const schedule = () => {
      timer = setTimeout(() => {
        sync();
        schedule();
      }, msUntilNextPeriod());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return period;
}
