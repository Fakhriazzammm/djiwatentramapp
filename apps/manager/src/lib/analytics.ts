export type Metric = "orders" | "revenue";
export type HeatCell = { dow: number; hour: number; orders: number; revenue: number };
export type HeatmapPayload = { sampleDays: number; cells: HeatCell[] };
export type HourTotal = { hour: number; orders: number; revenue: number };
export type DayTotal = { dow: number; orders: number; revenue: number };
export type Confidence = "insufficient" | "daily" | "medium" | "high";

export const DOW_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
export const DOW_LONG = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export function metricValue(item: { orders: number; revenue: number }, metric: Metric): number {
  return metric === "orders" ? item.orders : item.revenue;
}

export function buildHeatmapTotals(cells: HeatCell[]) {
  const hours: HourTotal[] = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  const days: DayTotal[] = Array.from({ length: 7 }, (_, index) => ({ dow: index + 1, orders: 0, revenue: 0 }));
  const grid = new Map<string, HeatCell>();
  for (const cell of cells) {
    const hour = hours[cell.hour];
    const day = days[cell.dow - 1];
    if (!hour || !day) continue;
    hour.orders += cell.orders;
    hour.revenue += cell.revenue;
    day.orders += cell.orders;
    day.revenue += cell.revenue;
    grid.set(`${cell.dow}-${cell.hour}`, cell);
  }
  return { hours, days, grid };
}

export function topHours(hours: HourTotal[], metric: Metric, limit = 5): HourTotal[] {
  return hours
    .filter((hour) => metricValue(hour, metric) > 0)
    .sort((left, right) => metricValue(right, metric) - metricValue(left, metric) || left.hour - right.hour)
    .slice(0, limit);
}

export function topDays(days: DayTotal[], metric: Metric): DayTotal[] {
  return days
    .filter((day) => metricValue(day, metric) > 0)
    .sort((left, right) => metricValue(right, metric) - metricValue(left, metric) || left.dow - right.dow);
}

export function heatIntensity(value: number, max: number): number {
  if (!max || value <= 0) return 0;
  return Math.min(1, Math.sqrt(value / max));
}

export function confidenceForSampleDays(sampleDays: number): Confidence {
  if (sampleDays <= 0) return "insufficient";
  if (sampleDays < 7) return "daily";
  if (sampleDays <= 20) return "medium";
  return "high";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  insufficient: "Data belum cukup",
  daily: "Keyakinan rendah",
  medium: "Keyakinan sedang",
  high: "Keyakinan tinggi",
};
