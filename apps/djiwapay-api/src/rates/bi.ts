/** BI-Rate from Bank Indonesia's own indicator page. The page embeds the whole history as JSON in a hidden field
 *  (HiddenFieldChartData: [[timestamp, rate, "6,00 %"], ...]) and as a table; both are read, the JSON first. Pure parsing, no network. */
export type RatePoint = { day: string; rate: number };
export const BI_URL = "https://www.bi.go.id/id/statistik/indikator/bi-rate.aspx";

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
const MONTHS: Record<string, number> = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12 };

function clean(points: RatePoint[]): RatePoint[] {
  const byDay = new Map<string, number>();
  for (const p of points) if (/^\d{4}-\d{2}-\d{2}$/.test(p.day) && Number.isFinite(p.rate) && p.rate > 0 && p.rate <= 25) byDay.set(p.day, Math.round(p.rate * 100) / 100);
  return [...byDay].map(([day, rate]) => ({ day, rate })).sort((a, b) => (a.day < b.day ? 1 : -1));
}

export function parseBiRate(html: string): RatePoint[] {
  const tag = html.match(/<input[^>]*id="HiddenFieldChartData"[^>]*>/i)?.[0];
  const raw = tag?.match(/\svalue=(?:"([^"]*)"|'([^']*)')/i);
  if (raw) {
    try {
      const rows = JSON.parse(decode(raw[1] ?? raw[2] ?? "")) as unknown[];
      const pts = clean(rows.filter(Array.isArray).map((r) => ({ day: new Date(Number((r as unknown[])[0])).toISOString().slice(0, 10), rate: Number((r as unknown[])[1]) })));
      if (pts.length >= 12) return pts;
    } catch { /* fall through to the table */ }
  }
  const out: RatePoint[] = [];
  for (const m of html.matchAll(/<td[^>]*>\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*%\s*<\/td>/g)) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) out.push({ day: `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`, rate: Number(m[4].replace(/\./g, "").replace(",", ".")) });
  }
  const pts = clean(out);
  if (pts.length < 3) throw new Error("BI_RATE_UNREADABLE");
  return pts;
}

export async function fetchBiRate(f: typeof fetch = fetch): Promise<RatePoint[]> {
  const res = await f(BI_URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DjiwaPay/1.0; +https://djiwapay.web.id)", Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`BI_RATE_HTTP_${res.status}`);
  return parseBiRate(await res.text());
}

/** The person-facing summary of a list of decisions, newest first. */
export function summarizeRates(points: RatePoint[]) {
  const cur = points[0];
  if (!cur) return null;
  let last: { day: string; from: number; to: number; bps: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) if (points[i].rate !== points[i + 1].rate) { last = { day: points[i].day, from: points[i + 1].rate, to: points[i].rate, bps: Math.round((points[i].rate - points[i + 1].rate) * 100) }; break; }
  return { rate: cur.rate, day: cur.day, previous: points[1]?.rate ?? null, lastChange: last };
}
