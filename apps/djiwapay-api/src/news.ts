import type { Hono } from "hono";

/** Daily finance headlines from public publisher RSS feeds. Only title, link, source and time are kept; the article opens on the publisher's site. */
export type NewsTopic = "emas" | "saham" | "kripto" | "ekonomi";
export type NewsItem = { title: string; url: string; source: string; at: string; topic: NewsTopic };
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const FEEDS = [
  { source: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/market/rss" },
  { source: "Antara News", url: "https://www.antaranews.com/rss/ekonomi-bisnis.xml" },
];
const RULES: [NewsTopic, RegExp][] = [
  ["kripto", /kripto|crypto|bitcoin|\bbtc\b|ethereum|\beth\b|altcoin|stablecoin|solana/i],
  ["emas", /\bemas\b|antam|galeri\s?24|ubs\b|logam mulia|pegadaian/i],
  ["saham", /saham|ihsg|bursa|emiten|\bbei\b|\bipo\b|dividen|reksa dana|obligasi/i],
];
export const topicOf = (title: string): NewsTopic => RULES.find(([, re]) => re.test(title))?.[0] ?? "ekonomi";

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const tag = (block: string, name: string) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i")); return m ? decode(m[1]) : ""; };

export function parseFeed(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0], title = tag(b, "title"), url = tag(b, "link"), d = new Date(tag(b, "pubDate"));
    if (!title || !/^https:\/\//.test(url) || Number.isNaN(+d)) continue;
    out.push({ title, url, source, at: d.toISOString(), topic: topicOf(title) });
  }
  return out;
}

let cache: { at: number; items: NewsItem[] } | null = null;
const TTL = 10 * 60_000;
export async function loadNews(f: Fetch = fetch as Fetch, now = Date.now()): Promise<NewsItem[]> {
  if (cache && now - cache.at < TTL) return cache.items;
  const parts = await Promise.all(FEEDS.map(async (feed) => {
    try {
      const r = await f(feed.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DjiwaPay/1.0)" }, signal: AbortSignal.timeout(10_000) });
      return r.ok ? parseFeed(await r.text(), feed.source) : [];
    } catch { return []; }
  }));
  const seen = new Set<string>(), items = parts.flat().filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true))).sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 120);
  if (items.length) cache = { at: now, items };
  return items.length ? items : cache?.items ?? [];
}
export const resetNewsCache = () => { cache = null; };

export function registerNewsRoutes(app: Hono, json: (c: any, body: unknown, status?: number) => Response, f?: Fetch) {
  app.get("/api/finance/news", async (c) => {
    const topic = c.req.query("topic"), all = await loadNews(f), items = topic && topic !== "semua" ? all.filter((i) => i.topic === topic) : all;
    return json(c, { success: true, items: items.slice(0, 30), updatedAt: new Date().toISOString() });
  });
}
